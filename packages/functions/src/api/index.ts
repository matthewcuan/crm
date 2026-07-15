import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Hono } from "hono";
import { handle } from "hono/aws-lambda";
import { extractText, getDocumentProxy } from "unpdf";
import * as apps from "@crm/core/applications";
import * as contacts from "@crm/core/contacts";
import { todayInTz } from "@crm/core/dates";
import { listDueFollowUps } from "@crm/core/followups";
import { newId } from "@crm/core/ids";
import * as interactions from "@crm/core/interactions";
import * as resumes from "@crm/core/resumes";
import { TEMPLATES } from "@crm/core/templates";
import {
  isAllowedEmail,
  issueToken,
  requireAuth,
  verifyGoogleCredential,
  type AuthEnv,
} from "./auth";
import { fetchJobPage, sourceFromUrl } from "./fetch-job";
import { draftMessage, extractJob, extractResumeProfile } from "./llm";

const s3 = new S3Client({});
const app = new Hono<AuthEnv>();

app.onError((err, c) => {
  console.error(err);
  return c.json(
    { error: err instanceof Error ? err.message : "Internal error" },
    500,
  );
});

// API Gateway's $default route forwards even CORS preflights to us — answer
// them before the auth gate (a non-2xx preflight makes the browser abort the
// real request with a network error). API Gateway appends the CORS headers.
app.options("*", (c) => c.body(null, 204));

// ---------- auth (the only public route) ----------

app.post("/auth/google", async (c) => {
  const { credential } = await c.req.json<{ credential?: string }>();
  if (!credential) return c.json({ error: "Missing credential" }, 400);
  let email: string;
  try {
    email = await verifyGoogleCredential(credential);
  } catch {
    return c.json({ error: "Invalid Google credential" }, 401);
  }
  if (!isAllowedEmail(email)) {
    return c.json({ error: "This Google account is not allowed" }, 403);
  }
  return c.json({ token: await issueToken(email), email });
});

// Everything below requires a valid session JWT; requireAuth sets userEmail —
// the tenant key that scopes every query to the caller's own partition.
app.use("*", requireAuth);

// ---------- applications ----------

app.get("/applications", async (c) =>
  c.json(await apps.listApplications(c.get("userEmail"))),
);

app.post("/applications", async (c) => {
  const body = await c.req.json();
  if (!body.company || !body.role) {
    return c.json({ error: "company and role are required" }, 400);
  }
  return c.json(await apps.createApplication(c.get("userEmail"), body), 201);
});

app.get("/applications/:id", async (c) => {
  const bundle = await apps.getApplicationBundle(
    c.get("userEmail"),
    c.req.param("id"),
  );
  return bundle ? c.json(bundle) : c.json({ error: "Not found" }, 404);
});

app.patch("/applications/:id", async (c) => {
  const updated = await apps.updateApplication(
    c.get("userEmail"),
    c.req.param("id"),
    await c.req.json(),
  );
  return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
});

app.delete("/applications/:id", async (c) => {
  await apps.deleteApplication(c.get("userEmail"), c.req.param("id"));
  return c.body(null, 204);
});

// ---------- contacts ----------

app.post("/applications/:id/contacts", async (c) => {
  const body = await c.req.json();
  if (!body.name || !body.type) {
    return c.json({ error: "name and type are required" }, 400);
  }
  return c.json(
    await contacts.createContact(c.get("userEmail"), c.req.param("id"), body),
    201,
  );
});

app.patch("/applications/:id/contacts/:contactId", async (c) => {
  const updated = await contacts.updateContact(
    c.get("userEmail"),
    c.req.param("id"),
    c.req.param("contactId"),
    await c.req.json(),
  );
  return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
});

app.delete("/applications/:id/contacts/:contactId", async (c) => {
  await contacts.deleteContact(
    c.get("userEmail"),
    c.req.param("id"),
    c.req.param("contactId"),
  );
  return c.body(null, 204);
});

// ---------- interactions ----------

app.post("/applications/:id/interactions", async (c) => {
  const body = await c.req.json();
  if (!body.body || !body.channel || !body.direction) {
    return c.json({ error: "body, channel and direction are required" }, 400);
  }
  return c.json(
    await interactions.createInteraction(
      c.get("userEmail"),
      c.req.param("id"),
      body,
    ),
    201,
  );
});

app.patch("/applications/:id/interactions/:interactionId", async (c) => {
  const updated = await interactions.updateInteraction(
    c.get("userEmail"),
    c.req.param("id"),
    c.req.param("interactionId"),
    await c.req.json(),
  );
  return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
});

app.delete("/applications/:id/interactions/:interactionId", async (c) => {
  await interactions.deleteInteraction(
    c.get("userEmail"),
    c.req.param("id"),
    c.req.param("interactionId"),
  );
  return c.body(null, 204);
});

// ---------- follow-ups (Due Today) ----------

app.get("/followups", async (c) => {
  const today =
    c.req.query("today") ??
    todayInTz(process.env.TIMEZONE ?? "America/Los_Angeles");
  return c.json(await listDueFollowUps(c.get("userEmail"), today));
});

// ---------- resumes ----------

app.get("/resumes", async (c) =>
  c.json(await resumes.listResumes(c.get("userEmail"))),
);

// Browser asks for a presigned URL, PUTs the PDF straight to S3
app.post("/resumes/upload-url", async (c) => {
  const { fileName } = await c.req.json<{ fileName?: string }>();
  const key = `resumes/${c.get("userEmail")}/${newId()}.pdf`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: key,
      ContentType: "application/pdf",
    }),
    { expiresIn: 300 },
  );
  return c.json({ url, key, fileName: fileName ?? "resume.pdf" });
});

// Create a resume from pasted text OR an uploaded PDF (s3Key)
app.post("/resumes", async (c) => {
  const user = c.get("userEmail");
  const body = await c.req.json<{
    label?: string;
    text?: string;
    s3Key?: string;
    fileName?: string;
  }>();
  if (!body.label) return c.json({ error: "label is required" }, 400);
  // A presigned key is scoped to its owner — refuse anyone else's object
  if (body.s3Key && !body.s3Key.startsWith(`resumes/${user}/`)) {
    return c.json({ error: "Invalid upload key" }, 403);
  }

  let rawText = body.text?.trim() ?? "";
  if (!rawText && body.s3Key) {
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME!,
        Key: body.s3Key,
      }),
    );
    const bytes = await obj.Body!.transformToByteArray();
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    rawText = text.trim();
  }
  if (!rawText) {
    return c.json({ error: "Provide resume text or an uploaded PDF" }, 400);
  }

  const profile = await extractResumeProfile(rawText);
  const resume = await resumes.createResume(user, {
    label: body.label,
    fileName: body.fileName,
    rawText,
    skills: profile.skills,
    summary: profile.summary,
  });
  return c.json(resume, 201);
});

app.patch("/resumes/:id", async (c) => {
  const updated = await resumes.updateResume(
    c.get("userEmail"),
    c.req.param("id"),
    await c.req.json(),
  );
  return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
});

app.delete("/resumes/:id", async (c) => {
  await resumes.deleteResume(c.get("userEmail"), c.req.param("id"));
  return c.body(null, 204);
});

// ---------- LLM: job extraction + message drafting ----------

app.post("/extract/job", async (c) => {
  const { url, text } = await c.req.json<{ url?: string; text?: string }>();
  const source = url ? sourceFromUrl(url) : undefined;

  let jobText = text?.trim() ?? "";
  if (!jobText && url) {
    const page = await fetchJobPage(url);
    if ("blocked" in page) {
      // UI falls back to "paste the description text"
      return c.json({ blocked: true, reason: page.reason, source });
    }
    jobText = page.text;
  }
  if (!jobText) {
    return c.json({ error: "Provide a url or the job description text" }, 400);
  }

  const fields = await extractJob(jobText);
  return c.json({ fields: { ...fields, source }, jobText });
});

app.post("/draft", async (c) => {
  const user = c.get("userEmail");
  const body = await c.req.json<{
    applicationId?: string;
    resumeId?: string;
    templateKey?: string;
    contactId?: string;
  }>();
  if (!body.applicationId || !body.templateKey) {
    return c.json({ error: "applicationId and templateKey are required" }, 400);
  }
  const template = TEMPLATES.find((t) => t.key === body.templateKey);
  if (!template) return c.json({ error: "Unknown template" }, 400);

  const bundle = await apps.getApplicationBundle(user, body.applicationId);
  if (!bundle) return c.json({ error: "Application not found" }, 404);

  // Resume priority: explicit choice → application's resume → the default
  const allResumes = await resumes.listResumes(user);
  const resume =
    allResumes.find(
      (r) => r.id === (body.resumeId ?? bundle.application.resumeId),
    ) ??
    allResumes.find((r) => r.isDefault) ??
    null;
  const contact =
    bundle.contacts.find((ct) => ct.id === body.contactId) ?? null;

  const message = await draftMessage({
    template,
    job: bundle.application,
    resume,
    contact: contact ? { name: contact.name, type: contact.type } : null,
  });
  return c.json({ message, resumeId: resume?.id ?? null });
});

export const handler = handle(app);

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { MessageTemplate } from "@crm/core/templates";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// Cheap/fast model for structured extraction; higher-quality model for prose.
// Override per-stage via env if you ever want e.g. claude-opus-4-8 drafts.
const EXTRACT_MODEL = process.env.EXTRACT_MODEL ?? "claude-haiku-4-5";
const DRAFT_MODEL = process.env.DRAFT_MODEL ?? "claude-sonnet-5";

const JobFieldsSchema = z.object({
  company: z.string(),
  role: z.string(),
  location: z.string().nullable(),
  seniority: z.string().nullable(),
  salary: z.string().nullable(),
  keySkills: z.array(z.string()),
});
export type JobFields = z.infer<typeof JobFieldsSchema>;

/** Job description text → structured fields (validated against the schema). */
export async function extractJob(jobText: string): Promise<JobFields> {
  const response = await client.messages.parse({
    model: EXTRACT_MODEL,
    max_tokens: 2000,
    system:
      "You extract structured fields from job postings. Use null for fields not present in the text. " +
      "keySkills: the 5-12 most important technologies/skills for the role, ordered by importance.",
    messages: [
      {
        role: "user",
        content: `Extract the fields from this job posting:\n\n${jobText.slice(0, 40_000)}`,
      },
    ],
    output_config: { format: zodOutputFormat(JobFieldsSchema) },
  });
  if (!response.parsed_output) throw new Error("Job extraction failed");
  return response.parsed_output;
}

const ResumeProfileSchema = z.object({
  skills: z.array(z.string()),
  summary: z.string(),
});
export type ResumeProfile = z.infer<typeof ResumeProfileSchema>;

/** Resume text → skills list + positioning summary. */
export async function extractResumeProfile(
  resumeText: string,
): Promise<ResumeProfile> {
  const response = await client.messages.parse({
    model: EXTRACT_MODEL,
    max_tokens: 1500,
    system:
      "You analyze resumes for a job seeker. " +
      "skills: 10-25 concrete skills/technologies actually present in the resume, ordered by prominence. " +
      "summary: a 1-2 sentence first-person positioning pitch capturing what kind of engineer this resume presents.",
    messages: [
      {
        role: "user",
        content: `Analyze this resume:\n\n${resumeText.slice(0, 40_000)}`,
      },
    ],
    output_config: { format: zodOutputFormat(ResumeProfileSchema) },
  });
  if (!response.parsed_output) throw new Error("Resume analysis failed");
  return response.parsed_output;
}

export interface DraftParams {
  template: MessageTemplate;
  job: {
    company: string;
    role: string;
    location?: string;
    seniority?: string;
    keySkills?: string[];
    jobText?: string;
  };
  resume: { skills: string[]; summary?: string; rawText: string } | null;
  contact: { name: string; type: string } | null;
}

/** Personalize an outreach template using the job + resume + contact. */
export async function draftMessage(params: DraftParams): Promise<string> {
  const { template, job, resume, contact } = params;

  const parts = [
    `Template to follow (structure and tone):\n${template.body}`,
    `Recipient: ${contact?.name ?? "[Name]"} (${contact?.type ?? "role unknown"})`,
    `Job: ${job.role} at ${job.company}${job.location ? `, ${job.location}` : ""}`,
    job.keySkills?.length
      ? `Key skills the role asks for: ${job.keySkills.join(", ")}`
      : "",
    job.jobText ? `Job description (excerpt):\n${job.jobText.slice(0, 3000)}` : "",
    resume
      ? `Candidate summary: ${resume.summary ?? ""}\nCandidate skills: ${resume.skills.join(", ")}\nCandidate resume (excerpt):\n${resume.rawText.slice(0, 4000)}`
      : "Candidate details: not provided — keep skill claims generic.",
    "If the recipient's name is unknown, keep the placeholder [Name].",
  ].filter(Boolean);

  const response = await client.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 700,
    system:
      "You write short, natural outreach messages (LinkedIn/email) for a job seeker. Rules: " +
      "stay under 600 characters unless the template clearly requires more; be specific, warm, and not pushy; " +
      "mention 2-4 skills that GENUINELY overlap between the candidate's resume and the role; " +
      "never invent experience the candidate does not have; no emojis, no buzzword fluff. " +
      "Output ONLY the message text — no preamble, no subject line, no surrounding quotes.",
    messages: [{ role: "user", content: parts.join("\n\n") }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("Draft generation failed");
  return text.text.trim();
}

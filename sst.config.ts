/// <reference path="./.sst/platform/config.d.ts" />

// Job-search CRM — serverless AWS architecture:
//
//   Browser ── CloudFront ──► S3            (static React SPA)
//        └───► API Gateway ──► Lambda (Hono) ──► DynamoDB (single table)
//                                    ├────────► S3 (resume PDFs)
//                                    └────────► Claude API
//   EventBridge cron ──► reminder Lambda ──► SES (daily follow-up email)
//
// Everything scales to zero; idle cost is pennies of storage.
export default $config({
  app(input) {
    return {
      name: "job-crm",
      // Keep the DynamoDB table + bucket if the production stack is ever removed
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
    };
  },
  async run() {
    const TIMEZONE = "America/Los_Angeles"; // used for "due today" boundaries

    // Secrets — set once per stage with: npx sst secret set <Name> <value>
    const googleClientId = new sst.Secret("GoogleClientId");
    const jwtSecret = new sst.Secret("JwtSecret");
    const anthropicApiKey = new sst.Secret("AnthropicApiKey");
    // Comma-separated sign-in allowlist (kept out of the repo — it's PII).
    // Each entry gets an isolated workspace; the FIRST entry doubles as the
    // SES sender. npx sst secret set AllowedEmails "you@x.com,other@y.com"
    const allowedEmails = new sst.Secret("AllowedEmails");
    const senderEmail = allowedEmails.value.apply(
      (v) => v.split(",")[0]!.trim().toLowerCase(),
    );

    // Single-table DynamoDB design: base table + 2 GSIs.
    //   gsi1: APPLIST / <status>#<dateSaved>  → list/board of all applications
    //   gsi2: FOLLOWUP / <dueDate>            → sparse index of open follow-ups
    const table = new sst.aws.Dynamo("Table", {
      fields: {
        pk: "string",
        sk: "string",
        gsi1pk: "string",
        gsi1sk: "string",
        gsi2pk: "string",
        gsi2sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      globalIndexes: {
        gsi1: { hashKey: "gsi1pk", rangeKey: "gsi1sk" },
        gsi2: { hashKey: "gsi2pk", rangeKey: "gsi2sk" },
      },
      transform: {
        table: { pointInTimeRecovery: { enabled: true } },
      },
    });

    // Resume PDF uploads (browser PUTs via presigned URLs)
    const bucket = new sst.aws.Bucket("Resumes");

    // SES sender identity. While SES is in sandbox, reminder RECIPIENTS must
    // also be verified — one-time per new user, via SES console/CLI (see
    // docs/DEPLOY.md). Identities created by earlier deploys are retained.
    const email = new sst.aws.Email("Email", { sender: senderEmail });

    const environment = {
      TABLE_NAME: table.name,
      BUCKET_NAME: bucket.name,
      GOOGLE_CLIENT_ID: googleClientId.value,
      JWT_SECRET: jwtSecret.value,
      ANTHROPIC_API_KEY: anthropicApiKey.value,
      ALLOWED_EMAILS: allowedEmails.value,
      TIMEZONE,
    };

    // One Lambda (Hono router) handles every API route
    const api = new sst.aws.ApiGatewayV2("Api", { cors: true });
    api.route("$default", {
      handler: "packages/functions/src/api/index.handler",
      link: [table, bucket],
      environment,
      timeout: "29 seconds", // API Gateway caps integrations at 30s
      nodejs: { install: ["unpdf"] }, // keep the PDF lib un-bundled
    });

    // Static React SPA on S3 + CloudFront
    const web = new sst.aws.StaticSite("Web", {
      path: "packages/web",
      build: { command: "npm run build", output: "dist" },
      errorPage: "index.html", // SPA fallback so client-side routes survive refresh
      environment: {
        VITE_API_URL: api.url,
        VITE_GOOGLE_CLIENT_ID: googleClientId.value,
      },
      dev: { command: "npm run dev", url: "http://localhost:5173" },
    });

    // Daily reminder digest — 15:00 UTC ≈ 7/8am Pacific
    new sst.aws.Cron("Reminders", {
      schedule: "cron(0 15 * * ? *)",
      function: {
        handler: "packages/functions/src/reminders.handler",
        link: [table, email],
        environment: {
          TABLE_NAME: table.name,
          ALLOWED_EMAILS: allowedEmails.value, // one digest per user; [0] = sender
          TIMEZONE,
          APP_URL: web.url,
        },
        timeout: "60 seconds",
      },
    });

    return { web: web.url, api: api.url, table: table.name };
  },
});

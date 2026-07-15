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
    const ALLOWED_EMAIL = "owner@example.com"; // SES sender + reminder recipient
    // Everyone who may sign in. NOTE: this is a single-tenant app — every
    // allowed email sees and edits the SAME data.
    const ALLOWED_EMAILS = [ALLOWED_EMAIL];
    const TIMEZONE = "America/Los_Angeles"; // used for "due today" boundaries

    // Secrets — set once per stage with: npx sst secret set <Name> <value>
    const googleClientId = new sst.Secret("GoogleClientId");
    const jwtSecret = new sst.Secret("JwtSecret");
    const anthropicApiKey = new sst.Secret("AnthropicApiKey");

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

    // SES identities: the owner (sender) plus every reminder recipient must
    // be verified while SES is in sandbox — each address gets a one-time
    // verification email on first deploy. Index 0 keeps the original "Email"
    // component name so the existing identity isn't replaced.
    const emailIdentities = ALLOWED_EMAILS.map(
      (address, i) =>
        new sst.aws.Email(i === 0 ? "Email" : `Email${i + 1}`, {
          sender: address,
        }),
    );

    const environment = {
      TABLE_NAME: table.name,
      BUCKET_NAME: bucket.name,
      GOOGLE_CLIENT_ID: googleClientId.value,
      JWT_SECRET: jwtSecret.value,
      ANTHROPIC_API_KEY: anthropicApiKey.value,
      ALLOWED_EMAILS: ALLOWED_EMAILS.join(","),
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
        link: [table, ...emailIdentities],
        environment: {
          TABLE_NAME: table.name,
          ALLOWED_EMAIL, // sender identity
          ALLOWED_EMAILS: ALLOWED_EMAILS.join(","), // one digest per user
          TIMEZONE,
          APP_URL: web.url,
        },
        timeout: "60 seconds",
      },
    });

    return { web: web.url, api: api.url, table: table.name };
  },
});

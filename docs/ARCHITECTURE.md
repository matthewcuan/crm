# Architecture

## Overview

```
Your devices ──HTTPS──► CloudFront ──► S3            (React SPA: static files)
                             │
                             └──► API Gateway ──► Lambda (Hono router)
                                                    │
                                    ┌───────────────┼────────────────┐
                                    ▼               ▼                ▼
                               DynamoDB          S3 (resume      Claude API
                            (single table)        PDFs)       (extract + draft)
                                    ▲
        EventBridge (daily) ──► reminder Lambda ──► SES (follow-up digest email)
```

Everything scales to zero — idle cost is pennies of storage. The stack is
defined in `sst.config.ts` (SST v4) and deployed with
`sst deploy --stage production`.

## Auth & tenancy

Google Sign-In in the browser → the API Lambda verifies the ID token against
Google's JWKS, checks the email against `ALLOWED_EMAILS` (in `sst.config.ts`),
and issues a 30-day HS256 JWT that the SPA stores and replays on every
request. Any email not on the allowlist gets a 403 — on sign-in *and* on
every subsequent API call (removing an email kills existing sessions).

The app is **multi-tenant**: the verified email is the tenant key, baked into
every DynamoDB partition key (`USER#<email>#...`), so each allowed user gets
a fully isolated workspace — a query for one user's partition structurally
cannot return another's data. The frontend knows nothing about this; scoping
is entirely server-side. Adding a user = add to `ALLOWED_EMAILS` + Google
test users, deploy, and have them click their SES verification email.

The one CORS subtlety: the API uses a `$default` catch-all route, so API
Gateway forwards even OPTIONS preflights into the app — they're answered with
204 *before* the auth middleware (a non-2xx preflight makes browsers abort the
real request with a network error).

## LLM usage

| Task | Model | Notes |
|---|---|---|
| Job-posting extraction | `claude-haiku-4-5` | structured output (zod schema) |
| Resume skills/summary | `claude-haiku-4-5` | PDF → text via unpdf first |
| Outreach drafting | `claude-sonnet-5` | grounded in resume + job fields |

Models are overridable via `EXTRACT_MODEL` / `DRAFT_MODEL` env vars on the API
function. Cost is cents per job.

Job pages are fetched server-side; ATS pages (Greenhouse/Lever/Ashby) parse
well, while JS/auth-walled pages (LinkedIn, Indeed) return a `blocked`
response and the UI falls back to paste-the-text — extraction is identical
from there.

## DynamoDB single-table design

One table, two GSIs — every screen is one query, scoped to the caller
(`U#` below abbreviates the tenant prefix `USER#<email>#`):

| Item        | PK               | SK             | GSI1 (board)                  | GSI2 (follow-ups, sparse)    |
|-------------|------------------|----------------|-------------------------------|------------------------------|
| Application | `U#APP#<id>`     | `#META`        | `U#APPLIST` / `status#date`   | —                            |
| Contact     | `U#APP#<id>`     | `CONTACT#<id>` | —                             | —                            |
| Interaction | `U#APP#<id>`     | `INT#<ulid>`   | —                             | `U#FOLLOWUP` / `<dueDate>`   |
| Resume      | `U#RESUME`       | `RESUME#<id>`  | —                             | —                            |

- Detail page = `Query PK=APP#<id>` — the application, its contacts, and its
  interactions share a partition, so no joins.
- Board = `Query GSI1 PK=APPLIST` (sort key is `status#dateSaved`).
- Due today / reminder email = `Query GSI2 PK=FOLLOWUP, SK <= today`. GSI2 is
  a **sparse index**: an interaction only carries the GSI2 keys while it has
  an open `nextFollowUpAt`; marking it done rewrites the item without them and
  it drops out of the index. The index *is* the reminders queue.
- IDs are ULIDs, so `INT#<ulid>` sort keys are chronological for free.

Point-in-time recovery is enabled, and the production stage uses
`removal: "retain"` so a deleted stack keeps the table and buckets.

## Secrets

`sst secret set <Name> <value> --stage production` stores values encrypted in
SSM Parameter Store. At deploy time they're injected as Lambda environment
variables (`JWT_SECRET`, `ANTHROPIC_API_KEY`, `GOOGLE_CLIENT_ID`) and, for the
client ID only, baked into the public web bundle. Changing a secret requires a
redeploy.

| Secret | Used by | Sensitivity |
|---|---|---|
| `GoogleClientId` | Lambda + web bundle | public by design |
| `JwtSecret` | API Lambda | rotating it logs out all sessions |
| `AnthropicApiKey` | API Lambda | revoke + rotate if leaked |

## Deploy pipeline

`sst deploy` evaluates `sst.config.ts` into a desired-resource graph, diffs it
against state (stored in an S3 bucket in the account), and applies the
difference in dependency order. Two builds happen inside the deploy: esbuild
bundles the Lambdas, and the SPA is built with the real API URL baked in
(which is why the site builds after the API exists). CloudFront provisioning
dominates the first deploy (~5–10 min); later deploys are fast diffs.

`scripts/` contains the scripted runbook (IAM bootstrap, credential setup,
deploy + smoke checks, reminder test). Not scriptable: Google OAuth client
creation/origins, Anthropic key creation, and clicking the SES verification
link.

## Costs

| Piece | Cost |
|---|---|
| DynamoDB, S3, Lambda, API GW, CloudFront, EventBridge, SES | ~$0 at single-user volume |
| Claude API | cents — Haiku extraction + Sonnet drafts |

## Operational notes

- **Timezone** for "due today" is `America/Los_Angeles` — change `TIMEZONE`
  (and the cron hour) in `sst.config.ts` if needed. The dashboard passes the
  browser's local date (`/followups?today=YYYY-MM-DD`); the cron uses
  `TIMEZONE`.
- **Reminder email** runs daily at 15:00 UTC and skips sending when nothing is
  due. SES stays in sandbox mode forever — sender and recipient are the same
  verified address.
- **SES from a gmail address** can occasionally land in spam (gmail's DMARC);
  moving to a custom domain identity fixes that if it ever matters.

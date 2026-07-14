# Job CRM

A single-user, serverless job-search CRM. The philosophy (and the reason it
exists): **job-search success comes from conversations, not application volume.**
Capture a job by pasting a link, tailor outreach with your resume, draft the
message with Claude, send it manually, and let the app nag you to follow up
4–7 days later.

## Architecture

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

Everything scales to zero — idle cost is pennies of storage. Only real spend is
Claude usage: `claude-haiku-4-5` for extraction, `claude-sonnet-5` for drafts
(cents per job; override with `EXTRACT_MODEL` / `DRAFT_MODEL` env vars).

**Auth:** Google Sign-In in the browser → Lambda verifies the ID token against
Google's JWKS, checks the email is yours, and issues a 30-day JWT the SPA
replays on every request. Nobody else can log in.

### DynamoDB single-table design

One table, two GSIs — every screen is one query:

| Item        | PK           | SK             | GSI1 (board)              | GSI2 (follow-ups, sparse) |
|-------------|--------------|----------------|---------------------------|---------------------------|
| Application | `APP#<id>`   | `#META`        | `APPLIST` / `status#date` | —                         |
| Contact     | `APP#<id>`   | `CONTACT#<id>` | —                         | —                         |
| Interaction | `APP#<id>`   | `INT#<ulid>`   | —                         | `FOLLOWUP` / `<dueDate>`  |
| Resume      | `RESUME`     | `RESUME#<id>`  | —                         | —                         |

- Detail page = `Query PK=APP#<id>` (app + contacts + interactions, no joins)
- Board = `Query GSI1 PK=APPLIST`
- Due today / reminder email = `Query GSI2 PK=FOLLOWUP, SK <= today` — an
  interaction only lives in GSI2 while it has an open follow-up date; marking
  it done removes the keys and it drops out of the index.

## Repo layout

```
sst.config.ts              # all infrastructure (SST v4)
packages/
  core/                    # shared types, templates, DynamoDB data layer
  functions/               # api/ (Hono Lambda) + reminders.ts (cron Lambda)
  web/                     # Vite + React + Tailwind SPA
```

## Prerequisites

- **Node 22** (`nvm use 22`)
- **AWS access** with admin-level permissions — see `scripts/` below
- **Google OAuth client** — [console.cloud.google.com](https://console.cloud.google.com)
  → APIs & Services → Credentials → Create OAuth client ID → *Web application*.
  Add `http://localhost:5173` to "Authorized JavaScript origins" now; you'll
  add the CloudFront URL after the first deploy. (Not scriptable — Google has
  no public API for creating external OAuth clients.)
- **Anthropic API key** — [platform.claude.com](https://platform.claude.com)

## Deploy (scripted)

```sh
npm install

# AWS access — pick ONE:
#  A) (preferred, no stored keys) AWS console → IAM → Roles →
#     AmazonSSMManagedInstanceCore → Attach policies → AdministratorAccess,
#     then verify with:
./scripts/2-setup-credentials.sh
#  B) paste scripts/1-bootstrap-iam-cloudshell.sh into AWS CloudShell,
#     then run ./scripts/2-setup-credentials.sh and enter the printed keys.

# secrets + deploy + smoke checks (prompts for Google client ID / Anthropic key)
./scripts/3-deploy.sh

# optionally fire the reminder email right now instead of waiting for the cron
./scripts/4-test-reminder.sh
```

After `3-deploy.sh`, two manual clicks remain (it reminds you):

1. **SES**: click the verification link AWS emails you — without it the
   reminder email can't send. (Sandbox mode is fine forever: you only ever
   email yourself.)
2. **Google**: add the printed `web` CloudFront URL to the OAuth client's
   "Authorized JavaScript origins".

Then open the web URL, sign in with Google, add a resume, paste a job link.
Manual equivalent of the scripts: `npx sst secret set <Name> <value> --stage
production` for `GoogleClientId` / `JwtSecret` / `AnthropicApiKey`, then
`npx sst deploy --stage production`.

## Development

```sh
npx sst dev        # live Lambda dev + local Vite on :5173, against real AWS
```

## Costs

| Piece | Cost |
|---|---|
| DynamoDB, S3, Lambda, API GW, CloudFront, EventBridge, SES | ~$0 at single-user volume (on-demand / free tier) |
| Claude API | cents — Haiku extraction + Sonnet drafts |

## Things to know

- **Timezone** for "due today" is `America/Los_Angeles` — change `TIMEZONE`
  (and the cron hour) in `sst.config.ts` if that's not you.
- **LinkedIn/Indeed links** usually can't be fetched server-side (login walls).
  The UI detects this and falls back to paste-the-text — extraction is
  identical from there.
- **Data safety**: the table has point-in-time recovery enabled, and
  `removal: "retain"` means a deleted production stack keeps the table+bucket.
- The `/followups?today=YYYY-MM-DD` param comes from the browser so "today"
  matches wherever you are; the cron uses `TIMEZONE`.

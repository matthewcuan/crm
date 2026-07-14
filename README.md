# Job CRM

A single-user, serverless job-search CRM. Paste a job link → Claude extracts
the details and drafts personalized outreach from your resume → you send it
manually → the app reminds you to follow up 4–7 days later.

Built on the idea that **job-search success comes from conversations, not
application volume** — it automates everything around the outreach (capture,
tailoring, drafting, reminders) while the actual send stays manual.

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for how it works:
AWS design, data model, auth, costs, and operational notes.

## Quick start

```sh
nvm use 22
npm install

./scripts/2-setup-credentials.sh   # AWS access (see script header for options)
./scripts/3-deploy.sh              # secrets + deploy + smoke checks
```

Two manual clicks after the first deploy (the script reminds you):
1. Click the SES verification link AWS emails you (enables reminder emails)
2. Add the printed CloudFront URL to your Google OAuth client's
   authorized JavaScript origins

## Everyday commands

```sh
npx sst dev                          # local dev against real AWS
npm run typecheck                    # typecheck all packages
npx sst deploy --stage production    # deploy changes
./scripts/4-test-reminder.sh         # fire the reminder email now
```

## Layout

```
sst.config.ts        # all infrastructure (SST)
packages/core        # shared types + DynamoDB data layer
packages/functions   # API Lambda + reminder cron Lambda
packages/web         # React SPA
scripts/             # deploy runbook, scripted
```

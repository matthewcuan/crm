# Deploy & operate

## Repo layout

```
sst.config.ts        # all infrastructure (SST)
packages/core        # shared types + DynamoDB data layer
packages/functions   # API Lambda + reminder cron Lambda
packages/web         # React SPA
scripts/             # the runbook below, scripted
docs/                # this file + ARCHITECTURE.md
```

## First-time setup

```sh
nvm use 22
npm install

# AWS access — pick ONE:
#  A) (preferred, no stored keys) AWS console → IAM → Roles →
#     <instance role> → Attach policies → AdministratorAccess, then:
./scripts/2-setup-credentials.sh
#  B) paste scripts/1-bootstrap-iam-cloudshell.sh into AWS CloudShell,
#     then run ./scripts/2-setup-credentials.sh and enter the printed keys.

# secrets + deploy + smoke checks (prompts for Google client ID / Anthropic key)
./scripts/3-deploy.sh
```

Manual prerequisites the scripts can't do:

- **Google OAuth client** (console.cloud.google.com → APIs & Services →
  Credentials → OAuth client ID, Web application). Authorized JavaScript
  origins: `http://localhost:5173` + the CloudFront URL after first deploy.
- **Anthropic API key** (platform.claude.com → API Keys).
- **SES verification**: click the link AWS emails you after the first deploy.

## Everyday commands

```sh
npx sst dev                          # local dev against real AWS
npm run typecheck                    # typecheck all packages
npx sst deploy --stage production    # deploy changes
./scripts/4-test-reminder.sh         # fire the reminder email now
npx sst secret list --stage production
npx sst secret set <Name> <value> --stage production   # then redeploy
```

Gotcha: secrets are **per-stage** — without `--stage production` they land on
your personal dev stage and production won't see them.

## Adding a user

Each allowed email gets its own isolated workspace. The allowlist lives in
the `AllowedEmails` secret (comma-separated; the first entry is the SES
sender), not in the repo — emails are PII.

```sh
npx sst secret set AllowedEmails "owner@gmail.com,new-user@gmail.com" --stage production
npx sst deploy --stage production
```

Plus two one-time steps for the new user:
1. Add them as a **test user** on the Google OAuth consent screen.
2. Verify their address in **SES** (console → Amazon SES → Identities →
   Create identity → their email; they click the link AWS sends) so the
   daily reminder digest can reach them while SES is in sandbox.

Reminder digests go to the `ReminderEmails` secret (comma-separated subset
of `AllowedEmails`; empty = everyone). To opt a user in/out:

```sh
npx sst secret set ReminderEmails "owner@gmail.com,new-user@gmail.com" --stage production
npx sst deploy --stage production
```

## Live URLs

Printed at the end of every deploy, also in `.sst/outputs.json`.

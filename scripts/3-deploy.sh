#!/usr/bin/env bash
set -euo pipefail

# ── Run on the dev box ────────────────────────────────────────────────────────
# Sets SST secrets (prompting only for ones not already set), deploys the
# production stage, then runs smoke checks. Re-runnable: an unchanged stack
# deploys as a no-op, existing secrets are kept.
#
# Non-interactive: GOOGLE_CLIENT_ID=... ANTHROPIC_API_KEY=... scripts/3-deploy.sh

cd "$(dirname "$0")/.."
STAGE="${STAGE:-production}"

export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
echo "node: $(node -v)"

[ -f "$HOME/.aws/credentials" ] || {
  echo "No ~/.aws/credentials — run scripts/2-setup-credentials.sh first."; exit 1;
}

# ---- 1. verify credentials --------------------------------------------------
node -e '
const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
new STSClient({}).send(new GetCallerIdentityCommand({}))
  .then(r => console.log(`AWS credentials OK — account ${r.Account}`))
  .catch(e => { console.error("Credential check FAILED:", e.message); process.exit(1); });
'

# ---- 2. secrets (prompt only for missing ones) -------------------------------
SECRET_LIST=$(npx sst secret list --stage "$STAGE" 2>/dev/null || true)

ensure_secret() {
  local name="$1" prompt="$2" hidden="${3:-}" val="${4:-}"
  if echo "$SECRET_LIST" | grep -q "$name"; then
    echo "Secret $name already set — keeping it."
    return
  fi
  if [ -z "$val" ]; then
    if [ "$hidden" = "hidden" ]; then read -rsp "$prompt: " val; echo; else read -rp "$prompt: " val; fi
  fi
  [ -n "$val" ] || { echo "$name is required."; exit 1; }
  npx sst secret set "$name" "$val" --stage "$STAGE"
}

ensure_secret GoogleClientId "Google OAuth Client ID (...apps.googleusercontent.com)" "" "${GOOGLE_CLIENT_ID:-}"
ensure_secret AnthropicApiKey "Anthropic API key (sk-ant-...)" hidden "${ANTHROPIC_API_KEY:-}"
ensure_secret AllowedEmails "Comma-separated sign-in allowlist (first entry = SES sender)" "" "${ALLOWED_EMAILS:-}"
if ! echo "$SECRET_LIST" | grep -q JwtSecret; then
  npx sst secret set JwtSecret "$(openssl rand -base64 48)" --stage "$STAGE"
  echo "Generated a random JwtSecret."
fi

# ---- 3. deploy ---------------------------------------------------------------
echo; echo "Deploying stage '$STAGE' (first run takes ~5-10 min for CloudFront)..."
npx sst deploy --stage "$STAGE" 2>&1 | tee /tmp/sst-deploy.log

# ---- 4. capture outputs -------------------------------------------------------
get_output() {
  # try .sst/outputs.json first, fall back to grepping the deploy log
  node -e "
    try {
      const o = JSON.parse(require('fs').readFileSync('.sst/outputs.json','utf8'));
      if (o['$1']) { console.log(o['$1']); process.exit(0); }
    } catch {}
    process.exit(1);
  " 2>/dev/null || grep -Eo "$1: *https?://[^[:space:]]+" /tmp/sst-deploy.log | tail -1 | sed 's/^[^h]*//'
}
WEB_URL=$(get_output web || true)
API_URL=$(get_output api || true)
echo; echo "web: ${WEB_URL:-<not found — check deploy output>}"
echo "api: ${API_URL:-<not found — check deploy output>}"

# ---- 5. smoke checks ----------------------------------------------------------
echo; echo "── Smoke checks ──"
if [ -n "${WEB_URL:-}" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$WEB_URL")
  echo "GET $WEB_URL → $CODE $([ "$CODE" = 200 ] && echo '✓ site is up' || echo '✗ expected 200')"
fi
if [ -n "${API_URL:-}" ]; then
  CODE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/applications")
  echo "GET $API_URL/applications (no token) → $CODE $([ "$CODE" = 401 ] && echo '✓ auth gate works' || echo '✗ expected 401')"
fi

# SES identity status (verified only after you click the link AWS emailed you)
node -e '
const { SESv2Client, GetEmailIdentityCommand } = require("@aws-sdk/client-sesv2");
new SESv2Client({}).send(new GetEmailIdentityCommand({ EmailIdentity: "owner@example.com" }))
  .then(r => console.log(`SES sender verified: ${r.VerifiedForSendingStatus ? "✓ yes" : "✗ NOT YET — click the link in the email AWS sent you"}`))
  .catch(e => console.log("SES check skipped:", e.message));
'

# ---- 6. remaining manual steps -------------------------------------------------
cat <<EOF

── Manual steps that cannot be scripted ──
1. If SES shows "NOT YET": open owner@example.com, find the AWS
   "Email Address Verification Request", click the link (check spam).
2. Google Cloud Console → your OAuth client → Authorized JavaScript
   origins → add: ${WEB_URL:-<the web URL above>}
3. Open ${WEB_URL:-the web URL} and sign in with Google.

Optional: scripts/4-test-reminder.sh fires the daily reminder email now.
EOF

#!/usr/bin/env bash
set -euo pipefail

# ── Run on the dev box ────────────────────────────────────────────────────────
# Two ways for this EC2 box to get AWS access, tried in order:
#
#  A) Instance role (preferred — no stored keys): in the AWS console, go to
#     IAM → Roles → AmazonSSMManagedInstanceCore → Add permissions →
#     Attach policies → AdministratorAccess. Then just re-run this script.
#
#  B) Access keys: run scripts/1-bootstrap-iam-cloudshell.sh in AWS CloudShell,
#     then re-run this script and paste the keys when prompted (or pass them
#     via AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY env vars).
#
# Usage: scripts/2-setup-credentials.sh [region]     (default: us-east-2,
# this instance's own region)

cd "$(dirname "$0")/.."
REGION="${1:-us-east-2}"

export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

mkdir -p "$HOME/.aws"
cat > "$HOME/.aws/config" <<EOF
[default]
region = $REGION
EOF
echo "Wrote ~/.aws/config (region: $REGION)"

# Probe: do current credentials (instance role or existing keys) have the
# broad permissions SST needs? iam:ListRoles is a decent admin proxy — the
# stock SSM instance role fails it, AdministratorAccess passes.
probe() {
  node -e '
  const { STSClient, GetCallerIdentityCommand } = require("@aws-sdk/client-sts");
  const { IAMClient, ListRolesCommand } = require("@aws-sdk/client-iam");
  (async () => {
    const who = await new STSClient({}).send(new GetCallerIdentityCommand({}));
    console.error(`identity: ${who.Arn}`);
    await new IAMClient({}).send(new ListRolesCommand({ MaxItems: 1 }));
  })().then(() => process.exit(0)).catch((e) => { console.error(e.name + ": " + e.message); process.exit(1); });
  ' 2>&1
}

if OUT=$(probe); then
  echo "$OUT"
  echo "✓ Existing credentials have admin-level access — no access keys needed."
  exit 0
fi
echo "$OUT"
echo "Current credentials are missing permissions (expected if you haven't done option A or B yet)."

ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
SECRET_KEY="${AWS_SECRET_ACCESS_KEY:-}"
if [ -z "$ACCESS_KEY_ID" ]; then
  echo
  echo "Either do option A (attach AdministratorAccess to the instance role) and re-run,"
  echo "or paste access keys from scripts/1-bootstrap-iam-cloudshell.sh now."
  read -rp "AWS Access Key ID (blank to abort): " ACCESS_KEY_ID
  [ -n "$ACCESS_KEY_ID" ] || exit 1
fi
if [ -z "$SECRET_KEY" ]; then read -rsp "AWS Secret Access Key (hidden): " SECRET_KEY; echo; fi

cat > "$HOME/.aws/credentials" <<EOF
[default]
aws_access_key_id = $ACCESS_KEY_ID
aws_secret_access_key = $SECRET_KEY
EOF
chmod 600 "$HOME/.aws/credentials"
echo "Wrote ~/.aws/credentials"

if OUT=$(probe); then
  echo "$OUT"
  echo "✓ Credentials verified."
else
  echo "$OUT"
  echo "✗ Keys written but the permission probe failed — check the IAM user's policies."
  exit 1
fi

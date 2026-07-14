#!/usr/bin/env bash
set -euo pipefail

# ── Run this in AWS CloudShell, NOT on your dev box ──────────────────────────
# AWS Console → click the terminal icon (>_) in the top bar → paste this file.
# CloudShell is pre-authenticated as your console user, which is what lets us
# script IAM setup without any pre-existing access keys.
#
# Creates an IAM user `sst-deploy` with AdministratorAccess and prints the
# credentials block to save on the dev box (or feed to 2-setup-credentials.sh).

USER_NAME="sst-deploy"

if aws iam get-user --user-name "$USER_NAME" >/dev/null 2>&1; then
  echo "IAM user $USER_NAME already exists — minting a fresh access key."
else
  aws iam create-user --user-name "$USER_NAME" >/dev/null
  echo "Created IAM user: $USER_NAME"
fi

aws iam attach-user-policy \
  --user-name "$USER_NAME" \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
echo "Attached AdministratorAccess (SST needs broad rights: IAM roles, Lambda, CloudFront, ...)."

# IAM caps access keys at 2 per user — if this fails, delete an old key first:
#   aws iam list-access-keys --user-name sst-deploy
#   aws iam delete-access-key --user-name sst-deploy --access-key-id AKIA...
CREDS_JSON=$(aws iam create-access-key --user-name "$USER_NAME")
ACCESS_KEY_ID=$(echo "$CREDS_JSON" | jq -r .AccessKey.AccessKeyId)
SECRET_KEY=$(echo "$CREDS_JSON" | jq -r .AccessKey.SecretAccessKey)

cat <<EOF

────────────────────────────────────────────────────────────────────
Done. On the dev box, run  scripts/2-setup-credentials.sh  and paste
these two values when prompted (the secret is shown only this once):

  Access key ID:     $ACCESS_KEY_ID
  Secret access key: $SECRET_KEY
────────────────────────────────────────────────────────────────────
EOF

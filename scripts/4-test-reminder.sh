#!/usr/bin/env bash
set -euo pipefail

# ── Run on the dev box, after deploying ──────────────────────────────────────
# Manually invokes the daily reminder Lambda so you don't have to wait for
# the 15:00 UTC cron to test the email. (It skips sending when nothing is
# due — log an interaction with a follow-up date of today first.)

cd "$(dirname "$0")/.."
STAGE="${STAGE:-production}"

export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

node -e '
const { LambdaClient, ListFunctionsCommand, InvokeCommand } = require("@aws-sdk/client-lambda");
const stage = process.env.STAGE ?? "production";
const client = new LambdaClient({});

(async () => {
  let fn, marker;
  do {
    const page = await client.send(new ListFunctionsCommand({ Marker: marker }));
    fn = (page.Functions ?? []).find(
      (f) => f.FunctionName.includes(`job-crm-${stage}`) && f.FunctionName.includes("Reminders"),
    );
    marker = page.NextMarker;
  } while (!fn && marker);

  if (!fn) {
    console.error(`No Reminders function found for stage "${stage}" — did the deploy finish?`);
    process.exit(1);
  }
  console.log(`Invoking ${fn.FunctionName} ...`);
  const res = await client.send(
    new InvokeCommand({ FunctionName: fn.FunctionName, LogType: "Tail" }),
  );
  const logs = Buffer.from(res.LogResult ?? "", "base64").toString();
  console.log(logs.split("\n").filter((l) => !l.startsWith("START") && !l.startsWith("REPORT")).join("\n"));
  console.log(res.FunctionError ? `✗ Lambda errored: ${res.FunctionError}` : "✓ Invoked — check your inbox (or the log above for \"skipping\").");
})().catch((e) => { console.error(e.message); process.exit(1); });
'

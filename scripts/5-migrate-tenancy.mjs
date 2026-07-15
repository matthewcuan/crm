// One-time migration: re-key legacy single-tenant items under the owner's
// multi-tenant prefix (USER#<email>#...). Idempotent — already-prefixed items
// are skipped, so re-running is safe.
//
// Usage:  OWNER_EMAIL=you@example.com node scripts/5-migrate-tenancy.mjs            (dry run)
//         OWNER_EMAIL=you@example.com node scripts/5-migrate-tenancy.mjs --apply    (migrate)
// Env:    OWNER_EMAIL (required — legacy items become this user's)
//         TABLE_NAME  (default: read from .sst/outputs.json)

import { readFileSync } from "node:fs";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const OWNER = process.env.OWNER_EMAIL?.toLowerCase();
if (!OWNER) {
  console.error("Set OWNER_EMAIL to the user the legacy items belong to.");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

const TABLE =
  process.env.TABLE_NAME ??
  JSON.parse(readFileSync(new URL("../.sst/outputs.json", import.meta.url), "utf8"))
    .table;
if (!TABLE) {
  console.error("No table name — set TABLE_NAME or deploy first.");
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const prefix = (v) => `USER#${OWNER}#${v}`;

let migrated = 0;
let skipped = 0;
let unknown = 0;
let startKey;

do {
  const page = await ddb.send(
    new ScanCommand({ TableName: TABLE, ExclusiveStartKey: startKey }),
  );
  for (const item of page.Items ?? []) {
    const { pk, sk } = item;
    if (typeof pk !== "string") continue;

    if (pk.startsWith("USER#")) {
      skipped++;
      continue;
    }
    if (!pk.startsWith("APP#") && pk !== "RESUME") {
      console.warn(`unknown key shape, leaving alone: pk=${pk} sk=${sk}`);
      unknown++;
      continue;
    }

    const next = { ...item, pk: prefix(pk) };
    if (typeof item.gsi1pk === "string") next.gsi1pk = prefix(item.gsi1pk);
    if (typeof item.gsi2pk === "string") next.gsi2pk = prefix(item.gsi2pk);

    if (APPLY) {
      await ddb.send(new PutCommand({ TableName: TABLE, Item: next }));
      await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { pk, sk } }));
    }
    console.log(`${APPLY ? "migrated" : "would migrate"}: ${pk} / ${sk}`);
    migrated++;
  }
  startKey = page.LastEvaluatedKey;
} while (startKey);

console.log(
  `\n${APPLY ? "Done" : "Dry run"}: ${migrated} ${APPLY ? "migrated" : "to migrate"}, ` +
    `${skipped} already tenant-scoped, ${unknown} unknown${
      APPLY ? "" : "\nRe-run with --apply to perform the migration."
    }`,
);

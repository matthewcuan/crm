import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, nullsToUndefined, stripKeys, TABLE } from "./dynamo";
import { newId } from "./ids";
import type {
  Application,
  ApplicationBundle,
  Contact,
  Interaction,
  Status,
} from "./types";

export type NewApplicationInput = Omit<
  Application,
  "id" | "status" | "dateSaved"
> & { status?: Status };

/** Applications live at PK=APP#<id>, SK=#META and are listed via GSI1
 *  (APPLIST / <status>#<dateSaved>) so the board is a single Query. */
function appItem(app: Application) {
  return {
    pk: `APP#${app.id}`,
    sk: "#META",
    gsi1pk: "APPLIST",
    gsi1sk: `${app.status}#${app.dateSaved}`,
    ...app,
  };
}

export async function createApplication(
  input: NewApplicationInput,
): Promise<Application> {
  const app: Application = {
    status: "SAVED",
    ...input,
    id: newId(),
    dateSaved: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: appItem(app) }));
  return app;
}

export async function listApplications(): Promise<Application[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :p",
      ExpressionAttributeValues: { ":p": "APPLIST" },
      ScanIndexForward: false,
    }),
  );
  return (res.Items ?? []).map((i) => stripKeys<Application>(i));
}

export async function getApplicationMeta(
  id: string,
): Promise<Application | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { pk: `APP#${id}`, sk: "#META" } }),
  );
  return res.Item ? stripKeys<Application>(res.Item) : null;
}

/** One Query returns the application + its contacts + its interactions —
 *  they share a partition, so the detail page needs no joins. */
export async function getApplicationBundle(
  id: string,
): Promise<ApplicationBundle | null> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": `APP#${id}` },
    }),
  );
  const items = res.Items ?? [];
  const meta = items.find((i) => i.sk === "#META");
  if (!meta) return null;
  return {
    application: stripKeys<Application>(meta),
    contacts: items
      .filter((i) => String(i.sk).startsWith("CONTACT#"))
      .map((i) => stripKeys<Contact>(i)),
    interactions: items
      .filter((i) => String(i.sk).startsWith("INT#"))
      .map((i) => stripKeys<Interaction>(i))
      .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1)), // newest first
  };
}

export async function updateApplication(
  id: string,
  patch: Partial<Application>,
): Promise<Application | null> {
  const current = await getApplicationMeta(id);
  if (!current) return null;
  const merged: Application = {
    ...current,
    ...nullsToUndefined(patch),
    id,
    dateSaved: current.dateSaved,
  };
  // First move to APPLIED stamps the applied date
  if (
    patch.status === "APPLIED" &&
    current.status !== "APPLIED" &&
    !merged.dateApplied
  ) {
    merged.dateApplied = new Date().toISOString();
  }
  await ddb.send(new PutCommand({ TableName: TABLE, Item: appItem(merged) }));
  return merged;
}

/** Delete the whole partition: meta + contacts + interactions. */
export async function deleteApplication(id: string): Promise<void> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": `APP#${id}` },
      ProjectionExpression: "pk, sk",
    }),
  );
  const keys = res.Items ?? [];
  for (let i = 0; i < keys.length; i += 25) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE]: keys.slice(i, i + 25).map((k) => ({
            DeleteRequest: { Key: { pk: k.pk, sk: k.sk } },
          })),
        },
      }),
    );
  }
}

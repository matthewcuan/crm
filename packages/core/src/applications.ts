import {
  BatchWriteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, nullsToUndefined, stripKeys, TABLE, userPk } from "./dynamo";
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

/** Applications live at PK=USER#<u>#APP#<id>, SK=#META and are listed via
 *  GSI1 (USER#<u>#APPLIST / <status>#<dateSaved>) so each user's board is a
 *  single Query scoped to their partition. */
function appItem(userId: string, app: Application) {
  return {
    pk: userPk(userId, `APP#${app.id}`),
    sk: "#META",
    gsi1pk: userPk(userId, "APPLIST"),
    gsi1sk: `${app.status}#${app.dateSaved}`,
    ...app,
  };
}

export async function createApplication(
  userId: string,
  input: NewApplicationInput,
): Promise<Application> {
  const now = new Date().toISOString();
  const app: Application = {
    status: "SAVED",
    ...input,
    id: newId(),
    dateSaved: now,
    updatedAt: now,
  };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: appItem(userId, app) }),
  );
  return app;
}

export async function listApplications(userId: string): Promise<Application[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi1",
      KeyConditionExpression: "gsi1pk = :p",
      ExpressionAttributeValues: { ":p": userPk(userId, "APPLIST") },
      ScanIndexForward: false,
    }),
  );
  return (res.Items ?? []).map((i) => stripKeys<Application>(i));
}

export async function getApplicationMeta(
  userId: string,
  id: string,
): Promise<Application | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(userId, `APP#${id}`), sk: "#META" },
    }),
  );
  return res.Item ? stripKeys<Application>(res.Item) : null;
}

/** One Query returns the application + its contacts + its interactions —
 *  they share a partition, so the detail page needs no joins. */
export async function getApplicationBundle(
  userId: string,
  id: string,
): Promise<ApplicationBundle | null> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": userPk(userId, `APP#${id}`) },
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
  userId: string,
  id: string,
  patch: Partial<Application>,
): Promise<Application | null> {
  const current = await getApplicationMeta(userId, id);
  if (!current) return null;
  const merged: Application = {
    ...current,
    ...nullsToUndefined(patch),
    id,
    dateSaved: current.dateSaved,
    updatedAt: new Date().toISOString(),
  };
  // First move to APPLIED stamps the applied date
  if (
    patch.status === "APPLIED" &&
    current.status !== "APPLIED" &&
    !merged.dateApplied
  ) {
    merged.dateApplied = new Date().toISOString();
  }
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: appItem(userId, merged) }),
  );
  return merged;
}

/** Delete the whole partition: meta + contacts + interactions. */
export async function deleteApplication(
  userId: string,
  id: string,
): Promise<void> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": userPk(userId, `APP#${id}`) },
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

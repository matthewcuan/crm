import { BatchGetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, stripKeys, TABLE } from "./dynamo";
import type { Application, DueFollowUp, Interaction } from "./types";

/** Everything due on or before `todayStr` (YYYY-MM-DD) — one Query on the
 *  sparse GSI2 index, then a BatchGet to attach company/role for display.
 *  Powers both the Due Today dashboard and the daily reminder email. */
export async function listDueFollowUps(
  todayStr: string,
): Promise<DueFollowUp[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "gsi2",
      KeyConditionExpression: "gsi2pk = :p AND gsi2sk <= :today",
      ExpressionAttributeValues: { ":p": "FOLLOWUP", ":today": todayStr },
    }),
  );
  const interactions = (res.Items ?? []).map((i) => stripKeys<Interaction>(i));

  const appIds = [...new Set(interactions.map((i) => i.applicationId))];
  const apps = new Map<string, Application>();
  for (let i = 0; i < appIds.length; i += 100) {
    const batch = appIds.slice(i, i + 100);
    const r = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [TABLE]: { Keys: batch.map((id) => ({ pk: `APP#${id}`, sk: "#META" })) },
        },
      }),
    );
    for (const item of r.Responses?.[TABLE] ?? []) {
      const app = stripKeys<Application>(item);
      apps.set(app.id, app);
    }
  }

  return interactions.map((interaction) => ({
    interaction,
    application: apps.get(interaction.applicationId) ?? null,
  }));
}

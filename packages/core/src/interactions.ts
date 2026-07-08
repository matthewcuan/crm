import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, nullsToUndefined, stripKeys, TABLE } from "./dynamo";
import { newId } from "./ids";
import type { Interaction } from "./types";

export type NewInteractionInput = Omit<
  Interaction,
  "id" | "applicationId" | "sentAt"
> & { sentAt?: string };

/** Interactions live in the application's partition (SK=INT#<ulid>, so they
 *  sort chronologically). While `nextFollowUpAt` is set, the item also appears
 *  in GSI2 (FOLLOWUP / <dueDate>) — a sparse index that IS the reminders queue.
 *  Clearing the date rewrites the item without the GSI2 keys, dropping it out. */
function interactionItem(i: Interaction) {
  return {
    pk: `APP#${i.applicationId}`,
    sk: `INT#${i.id}`,
    ...(i.nextFollowUpAt
      ? { gsi2pk: "FOLLOWUP", gsi2sk: i.nextFollowUpAt }
      : {}),
    ...i,
  };
}

export async function createInteraction(
  applicationId: string,
  input: NewInteractionInput,
): Promise<Interaction> {
  const interaction: Interaction = {
    ...input,
    id: newId(),
    applicationId,
    sentAt: input.sentAt ?? new Date().toISOString(),
  };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: interactionItem(interaction) }),
  );
  return interaction;
}

export async function updateInteraction(
  applicationId: string,
  interactionId: string,
  patch: Partial<Interaction>,
): Promise<Interaction | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `APP#${applicationId}`, sk: `INT#${interactionId}` },
    }),
  );
  if (!res.Item) return null;
  const merged: Interaction = {
    ...stripKeys<Interaction>(res.Item),
    ...nullsToUndefined(patch),
    id: interactionId,
    applicationId,
  };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: interactionItem(merged) }),
  );
  return merged;
}

export async function deleteInteraction(
  applicationId: string,
  interactionId: string,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: `APP#${applicationId}`, sk: `INT#${interactionId}` },
    }),
  );
}

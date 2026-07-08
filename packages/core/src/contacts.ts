import { DeleteCommand, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, nullsToUndefined, stripKeys, TABLE } from "./dynamo";
import { newId } from "./ids";
import type { Contact } from "./types";

export type NewContactInput = Omit<Contact, "id" | "applicationId">;

function contactItem(c: Contact) {
  return { pk: `APP#${c.applicationId}`, sk: `CONTACT#${c.id}`, ...c };
}

export async function createContact(
  applicationId: string,
  input: NewContactInput,
): Promise<Contact> {
  const contact: Contact = { ...input, id: newId(), applicationId };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: contactItem(contact) }),
  );
  return contact;
}

export async function updateContact(
  applicationId: string,
  contactId: string,
  patch: Partial<Contact>,
): Promise<Contact | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: `APP#${applicationId}`, sk: `CONTACT#${contactId}` },
    }),
  );
  if (!res.Item) return null;
  const merged: Contact = {
    ...stripKeys<Contact>(res.Item),
    ...nullsToUndefined(patch),
    id: contactId,
    applicationId,
  };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: contactItem(merged) }),
  );
  return merged;
}

export async function deleteContact(
  applicationId: string,
  contactId: string,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: `APP#${applicationId}`, sk: `CONTACT#${contactId}` },
    }),
  );
}

import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, nullsToUndefined, stripKeys, TABLE, userPk } from "./dynamo";
import { newId } from "./ids";
import type { Resume } from "./types";

export type NewResumeInput = Omit<Resume, "id" | "createdAt" | "isDefault"> & {
  isDefault?: boolean;
};

function resumeItem(userId: string, r: Resume) {
  return { pk: userPk(userId, "RESUME"), sk: `RESUME#${r.id}`, ...r };
}

export async function createResume(
  userId: string,
  input: NewResumeInput,
): Promise<Resume> {
  const existing = await listResumes(userId);
  const resume: Resume = {
    isDefault: existing.length === 0, // first resume becomes the default
    ...input,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: resumeItem(userId, resume) }),
  );
  return resume;
}

export async function listResumes(userId: string): Promise<Resume[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": userPk(userId, "RESUME") },
      ScanIndexForward: false, // newest first (ULID sort keys)
    }),
  );
  return (res.Items ?? []).map((i) => stripKeys<Resume>(i));
}

export async function getResume(
  userId: string,
  id: string,
): Promise<Resume | null> {
  const res = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { pk: userPk(userId, "RESUME"), sk: `RESUME#${id}` },
    }),
  );
  return res.Item ? stripKeys<Resume>(res.Item) : null;
}

export async function updateResume(
  userId: string,
  id: string,
  patch: Partial<Resume>,
): Promise<Resume | null> {
  const current = await getResume(userId, id);
  if (!current) return null;

  // Making this one the default un-defaults the others
  if (patch.isDefault === true) {
    const others = (await listResumes(userId)).filter(
      (r) => r.id !== id && r.isDefault,
    );
    for (const other of others) {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: resumeItem(userId, { ...other, isDefault: false }),
        }),
      );
    }
  }

  const merged: Resume = { ...current, ...nullsToUndefined(patch), id };
  await ddb.send(
    new PutCommand({ TableName: TABLE, Item: resumeItem(userId, merged) }),
  );
  return merged;
}

export async function deleteResume(userId: string, id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE,
      Key: { pk: userPk(userId, "RESUME"), sk: `RESUME#${id}` },
    }),
  );
}

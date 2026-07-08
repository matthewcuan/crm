import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, nullsToUndefined, stripKeys, TABLE } from "./dynamo";
import { newId } from "./ids";
import type { Resume } from "./types";

export type NewResumeInput = Omit<Resume, "id" | "createdAt" | "isDefault"> & {
  isDefault?: boolean;
};

function resumeItem(r: Resume) {
  return { pk: "RESUME", sk: `RESUME#${r.id}`, ...r };
}

export async function createResume(input: NewResumeInput): Promise<Resume> {
  const existing = await listResumes();
  const resume: Resume = {
    isDefault: existing.length === 0, // first resume becomes the default
    ...input,
    id: newId(),
    createdAt: new Date().toISOString(),
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: resumeItem(resume) }));
  return resume;
}

export async function listResumes(): Promise<Resume[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :p",
      ExpressionAttributeValues: { ":p": "RESUME" },
      ScanIndexForward: false, // newest first (ULID sort keys)
    }),
  );
  return (res.Items ?? []).map((i) => stripKeys<Resume>(i));
}

export async function getResume(id: string): Promise<Resume | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { pk: "RESUME", sk: `RESUME#${id}` } }),
  );
  return res.Item ? stripKeys<Resume>(res.Item) : null;
}

export async function updateResume(
  id: string,
  patch: Partial<Resume>,
): Promise<Resume | null> {
  const current = await getResume(id);
  if (!current) return null;

  // Making this one the default un-defaults the others
  if (patch.isDefault === true) {
    const others = (await listResumes()).filter(
      (r) => r.id !== id && r.isDefault,
    );
    for (const other of others) {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: resumeItem({ ...other, isDefault: false }),
        }),
      );
    }
  }

  const merged: Resume = { ...current, ...nullsToUndefined(patch), id };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: resumeItem(merged) }));
  return merged;
}

export async function deleteResume(id: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: TABLE, Key: { pk: "RESUME", sk: `RESUME#${id}` } }),
  );
}

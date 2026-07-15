import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const TABLE = process.env.TABLE_NAME!;

export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  // Lets us "clear" a field by merging in `undefined` — the attr is dropped on Put
  marshallOptions: { removeUndefinedValues: true },
});

/** Multi-tenant partition prefix — the owner is baked into every PK, so a
 *  query for one user's partition structurally cannot return another's data.
 *  `#` is a safe delimiter (it cannot appear in an email address). */
export const userPk = (userId: string, suffix: string) =>
  `USER#${userId}#${suffix}`;

const KEY_ATTRS = ["pk", "sk", "gsi1pk", "gsi1sk", "gsi2pk", "gsi2sk"] as const;

/** Remove key attributes so stored items map back to clean domain objects. */
export function stripKeys<T>(item: Record<string, unknown>): T {
  const copy: Record<string, unknown> = { ...item };
  for (const k of KEY_ATTRS) delete copy[k];
  return copy as T;
}

/** JSON `null` in a PATCH means "clear this field" — convert to undefined so
 *  the spread-merge overrides the current value and Put drops the attribute. */
export function nullsToUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === null ? undefined : v;
  return out as T;
}

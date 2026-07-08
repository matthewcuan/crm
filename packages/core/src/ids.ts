import { ulid } from "ulid";

/** ULIDs sort lexicographically by creation time — used as both id and sort key. */
export const newId = () => ulid();

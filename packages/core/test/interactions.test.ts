import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createInteraction, updateInteraction } from "../src/interactions";

const ddb = mockClient(DynamoDBDocumentClient);
const USER = "a@x.com";

beforeEach(() => ddb.reset());

describe("createInteraction", () => {
  it("joins the sparse follow-up index while nextFollowUpAt is set", async () => {
    ddb.on(PutCommand).resolves({});
    await createInteraction(USER, "app1", {
      channel: "LINKEDIN",
      direction: "SENT",
      body: "hi",
      nextFollowUpAt: "2026-07-20",
    });

    const item = ddb.commandCalls(PutCommand)[0]!.args[0].input.Item!;
    expect(item.pk).toBe(`USER#${USER}#APP#app1`);
    expect(item.sk).toMatch(/^INT#/);
    expect(item.gsi2pk).toBe(`USER#${USER}#FOLLOWUP`);
    expect(item.gsi2sk).toBe("2026-07-20");
  });

  it("stays out of the follow-up index without a date", async () => {
    ddb.on(PutCommand).resolves({});
    await createInteraction(USER, "app1", {
      channel: "EMAIL",
      direction: "RECEIVED",
      body: "reply",
    });

    const item = ddb.commandCalls(PutCommand)[0]!.args[0].input.Item!;
    expect(item.gsi2pk).toBeUndefined();
    expect(item.gsi2sk).toBeUndefined();
  });

  it("defaults sentAt to now but accepts an explicit value", async () => {
    ddb.on(PutCommand).resolves({});
    const explicit = await createInteraction(USER, "app1", {
      channel: "OTHER",
      direction: "SENT",
      body: "x",
      sentAt: "2026-01-01T00:00:00.000Z",
    });
    expect(explicit.sentAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("updateInteraction", () => {
  const existing = {
    pk: `USER#${USER}#APP#app1`,
    sk: "INT#i1",
    gsi2pk: `USER#${USER}#FOLLOWUP`,
    gsi2sk: "2026-07-20",
    id: "i1",
    applicationId: "app1",
    channel: "LINKEDIN",
    direction: "SENT",
    body: "hi",
    sentAt: "2026-07-10T00:00:00.000Z",
    nextFollowUpAt: "2026-07-20",
  };

  it("drops out of the follow-up index when the date is cleared (done)", async () => {
    ddb.on(GetCommand).resolves({ Item: existing });
    ddb.on(PutCommand).resolves({});

    const updated = await updateInteraction(USER, "app1", "i1", {
      nextFollowUpAt: null,
      outcome: "followed-up",
    } as unknown as Record<string, unknown>);

    expect(updated!.outcome).toBe("followed-up");
    const item = ddb.commandCalls(PutCommand)[0]!.args[0].input.Item!;
    expect(item.gsi2pk).toBeUndefined();
    expect(item.gsi2sk).toBeUndefined();
  });

  it("re-keys the index when snoozed to a new date", async () => {
    ddb.on(GetCommand).resolves({ Item: existing });
    ddb.on(PutCommand).resolves({});

    await updateInteraction(USER, "app1", "i1", {
      nextFollowUpAt: "2026-07-23",
    });

    const item = ddb.commandCalls(PutCommand)[0]!.args[0].input.Item!;
    expect(item.gsi2pk).toBe(`USER#${USER}#FOLLOWUP`);
    expect(item.gsi2sk).toBe("2026-07-23");
  });

  it("returns null for a missing interaction", async () => {
    ddb.on(GetCommand).resolves({});
    expect(await updateInteraction(USER, "app1", "nope", {})).toBeNull();
  });
});

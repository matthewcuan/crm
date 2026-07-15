import {
  BatchGetCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { listDueFollowUps } from "../src/followups";

const ddb = mockClient(DynamoDBDocumentClient);
const USER = "a@x.com";

const interaction = (id: string, applicationId: string) => ({
  pk: `USER#${USER}#APP#${applicationId}`,
  sk: `INT#${id}`,
  gsi2pk: `USER#${USER}#FOLLOWUP`,
  gsi2sk: "2026-07-10",
  id,
  applicationId,
  channel: "LINKEDIN",
  direction: "SENT",
  body: "hi",
  sentAt: "2026-07-05T00:00:00.000Z",
  nextFollowUpAt: "2026-07-10",
});

beforeEach(() => ddb.reset());

describe("listDueFollowUps", () => {
  it("queries the user's sparse index up to today and joins the app", async () => {
    ddb.on(QueryCommand).resolves({
      Items: [interaction("i1", "app1"), interaction("i2", "app1")],
    });
    ddb.on(BatchGetCommand).resolves({
      Responses: {
        "test-table": [
          {
            pk: `USER#${USER}#APP#app1`,
            sk: "#META",
            id: "app1",
            company: "Acme",
            role: "Engineer",
            status: "MESSAGED",
            dateSaved: "2026-07-01T00:00:00.000Z",
          },
        ],
      },
    });

    const due = await listDueFollowUps(USER, "2026-07-15");

    const q = ddb.commandCalls(QueryCommand)[0]!.args[0].input;
    expect(q.IndexName).toBe("gsi2");
    expect(q.ExpressionAttributeValues![":p"]).toBe(`USER#${USER}#FOLLOWUP`);
    expect(q.ExpressionAttributeValues![":today"]).toBe("2026-07-15");

    // two interactions on the same application → one BatchGet key (deduped)
    const bg = ddb.commandCalls(BatchGetCommand)[0]!.args[0].input;
    expect(bg.RequestItems!["test-table"]!.Keys).toHaveLength(1);

    expect(due).toHaveLength(2);
    expect(due[0]!.application!.company).toBe("Acme");
  });

  it("returns application:null when the app was deleted", async () => {
    ddb.on(QueryCommand).resolves({ Items: [interaction("i1", "gone")] });
    ddb.on(BatchGetCommand).resolves({ Responses: { "test-table": [] } });

    const due = await listDueFollowUps(USER, "2026-07-15");
    expect(due[0]!.application).toBeNull();
  });

  it("skips the BatchGet entirely when nothing is due", async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });
    const due = await listDueFollowUps(USER, "2026-07-15");
    expect(due).toEqual([]);
    expect(ddb.commandCalls(BatchGetCommand)).toHaveLength(0);
  });
});

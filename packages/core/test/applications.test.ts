import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createApplication,
  deleteApplication,
  getApplicationBundle,
  listApplications,
  updateApplication,
} from "../src/applications";
import type { Application } from "../src/types";

const ddb = mockClient(DynamoDBDocumentClient);
const USER = "a@x.com";

const meta = (over: Partial<Application> = {}) => ({
  pk: `USER#${USER}#APP#app1`,
  sk: "#META",
  gsi1pk: `USER#${USER}#APPLIST`,
  gsi1sk: "SAVED#2026-07-01T00:00:00.000Z",
  id: "app1",
  company: "Acme",
  role: "Engineer",
  status: "SAVED",
  dateSaved: "2026-07-01T00:00:00.000Z",
  ...over,
});

beforeEach(() => ddb.reset());

describe("createApplication", () => {
  it("defaults to SAVED and writes tenant-scoped keys", async () => {
    ddb.on(PutCommand).resolves({});
    const app = await createApplication(USER, {
      company: "Acme",
      role: "Engineer",
    });

    expect(app.status).toBe("SAVED");
    expect(app.id).toBeTruthy();
    expect(app.dateSaved).toBe(app.updatedAt);

    const input = ddb.commandCalls(PutCommand)[0]!.args[0].input;
    expect(input.Item!.pk).toBe(`USER#${USER}#APP#${app.id}`);
    expect(input.Item!.sk).toBe("#META");
    expect(input.Item!.gsi1pk).toBe(`USER#${USER}#APPLIST`);
    expect(input.Item!.gsi1sk).toBe(`SAVED#${app.dateSaved}`);
  });

  it("respects an explicit status", async () => {
    ddb.on(PutCommand).resolves({});
    const app = await createApplication(USER, {
      company: "Acme",
      role: "Engineer",
      status: "APPLIED",
    });
    expect(app.status).toBe("APPLIED");
  });
});

describe("listApplications", () => {
  it("queries the user's GSI1 partition and strips keys", async () => {
    ddb.on(QueryCommand).resolves({ Items: [meta()] });
    const apps = await listApplications(USER);

    const input = ddb.commandCalls(QueryCommand)[0]!.args[0].input;
    expect(input.IndexName).toBe("gsi1");
    expect(input.ExpressionAttributeValues![":p"]).toBe(
      `USER#${USER}#APPLIST`,
    );
    expect(apps[0]).not.toHaveProperty("pk");
    expect(apps[0]!.company).toBe("Acme");
  });
});

describe("getApplicationBundle", () => {
  it("splits one partition query into app + contacts + interactions", async () => {
    ddb.on(QueryCommand).resolves({
      Items: [
        meta(),
        { pk: `USER#${USER}#APP#app1`, sk: "CONTACT#c1", id: "c1", name: "Jo" },
        {
          pk: `USER#${USER}#APP#app1`,
          sk: "INT#i1",
          id: "i1",
          sentAt: "2026-07-01T00:00:00.000Z",
        },
        {
          pk: `USER#${USER}#APP#app1`,
          sk: "INT#i2",
          id: "i2",
          sentAt: "2026-07-05T00:00:00.000Z",
        },
      ],
    });
    const bundle = await getApplicationBundle(USER, "app1");

    expect(bundle!.application.id).toBe("app1");
    expect(bundle!.contacts).toHaveLength(1);
    // newest first
    expect(bundle!.interactions.map((i) => i.id)).toEqual(["i2", "i1"]);
  });

  it("returns null when the partition has no #META", async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });
    expect(await getApplicationBundle(USER, "nope")).toBeNull();
  });
});

describe("updateApplication", () => {
  it("merges the patch, re-keys GSI1 by new status, keeps dateSaved", async () => {
    ddb.on(GetCommand).resolves({ Item: meta() });
    ddb.on(PutCommand).resolves({});

    const updated = await updateApplication(USER, "app1", {
      status: "MESSAGED",
      id: "evil-override",
      dateSaved: "1999-01-01T00:00:00.000Z",
    } as Partial<Application>);

    expect(updated!.id).toBe("app1");
    expect(updated!.dateSaved).toBe("2026-07-01T00:00:00.000Z");
    expect(updated!.updatedAt).not.toBe("2026-07-01T00:00:00.000Z");

    const input = ddb.commandCalls(PutCommand)[0]!.args[0].input;
    expect(input.Item!.gsi1sk).toBe("MESSAGED#2026-07-01T00:00:00.000Z");
  });

  it("stamps dateApplied on the first move to APPLIED only", async () => {
    ddb.on(GetCommand).resolves({ Item: meta() });
    ddb.on(PutCommand).resolves({});
    const updated = await updateApplication(USER, "app1", {
      status: "APPLIED",
    });
    expect(updated!.dateApplied).toBeTruthy();
  });

  it("clears a field when the patch sends null", async () => {
    ddb.on(GetCommand).resolves({ Item: meta({ resumeId: "r1" }) });
    ddb.on(PutCommand).resolves({});
    const updated = await updateApplication(USER, "app1", {
      resumeId: null,
    } as unknown as Partial<Application>);
    expect(updated!.resumeId).toBeUndefined();
  });

  it("returns null for a missing application", async () => {
    ddb.on(GetCommand).resolves({});
    expect(await updateApplication(USER, "nope", {})).toBeNull();
  });
});

describe("deleteApplication", () => {
  it("deletes the whole partition in chunks of 25", async () => {
    const keys = Array.from({ length: 30 }, (_, i) => ({
      pk: `USER#${USER}#APP#app1`,
      sk: `INT#${i}`,
    }));
    ddb.on(QueryCommand).resolves({ Items: keys });
    ddb.on(BatchWriteCommand).resolves({});

    await deleteApplication(USER, "app1");

    const calls = ddb.commandCalls(BatchWriteCommand);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.args[0].input.RequestItems!["test-table"]).toHaveLength(25);
    expect(calls[1]!.args[0].input.RequestItems!["test-table"]).toHaveLength(5);
  });
});

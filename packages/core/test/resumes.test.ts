import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createResume, updateResume } from "../src/resumes";

const ddb = mockClient(DynamoDBDocumentClient);
const USER = "a@x.com";

const resumeRow = (id: string, isDefault: boolean) => ({
  pk: `USER#${USER}#RESUME`,
  sk: `RESUME#${id}`,
  id,
  label: id,
  rawText: "text",
  skills: ["ts"],
  isDefault,
  createdAt: "2026-07-01T00:00:00.000Z",
});

beforeEach(() => ddb.reset());

describe("createResume", () => {
  it("makes the first resume the default, under the tenant partition", async () => {
    ddb.on(QueryCommand).resolves({ Items: [] });
    ddb.on(PutCommand).resolves({});

    const resume = await createResume(USER, {
      label: "Backend",
      rawText: "text",
      skills: ["ts"],
    });

    expect(resume.isDefault).toBe(true);
    const item = ddb.commandCalls(PutCommand)[0]!.args[0].input.Item!;
    expect(item.pk).toBe(`USER#${USER}#RESUME`);
    expect(item.sk).toBe(`RESUME#${resume.id}`);
  });

  it("does not steal default from an existing resume", async () => {
    ddb.on(QueryCommand).resolves({ Items: [resumeRow("r1", true)] });
    ddb.on(PutCommand).resolves({});
    const resume = await createResume(USER, {
      label: "Security",
      rawText: "text",
      skills: ["pki"],
    });
    expect(resume.isDefault).toBe(false);
  });
});

describe("updateResume", () => {
  it("un-defaults the others when promoting one to default", async () => {
    ddb.on(GetCommand).resolves({ Item: resumeRow("r2", false) });
    ddb
      .on(QueryCommand)
      .resolves({ Items: [resumeRow("r1", true), resumeRow("r2", false)] });
    ddb.on(PutCommand).resolves({});

    const updated = await updateResume(USER, "r2", { isDefault: true });
    expect(updated!.isDefault).toBe(true);

    const puts = ddb.commandCalls(PutCommand).map((c) => c.args[0].input.Item!);
    const demoted = puts.find((i) => i.id === "r1");
    expect(demoted).toBeDefined();
    expect(demoted!.isDefault).toBe(false);
  });

  it("returns null for a missing resume", async () => {
    ddb.on(GetCommand).resolves({});
    expect(await updateResume(USER, "nope", { label: "x" })).toBeNull();
  });
});

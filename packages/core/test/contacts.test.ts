import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it } from "vitest";
import { createContact, updateContact } from "../src/contacts";

const ddb = mockClient(DynamoDBDocumentClient);
const USER = "a@x.com";

beforeEach(() => ddb.reset());

describe("createContact", () => {
  it("stores the contact inside the application's tenant partition", async () => {
    ddb.on(PutCommand).resolves({});
    const contact = await createContact(USER, "app1", {
      name: "Jo Recruiter",
      type: "RECRUITER",
    });

    const item = ddb.commandCalls(PutCommand)[0]!.args[0].input.Item!;
    expect(item.pk).toBe(`USER#${USER}#APP#app1`);
    expect(item.sk).toBe(`CONTACT#${contact.id}`);
    expect(contact.applicationId).toBe("app1");
  });
});

describe("updateContact", () => {
  it("merges a patch onto the stored contact", async () => {
    ddb.on(GetCommand).resolves({
      Item: {
        pk: `USER#${USER}#APP#app1`,
        sk: "CONTACT#c1",
        id: "c1",
        applicationId: "app1",
        name: "Jo",
        type: "RECRUITER",
      },
    });
    ddb.on(PutCommand).resolves({});

    const updated = await updateContact(USER, "app1", "c1", {
      email: "jo@acme.com",
    });
    expect(updated!.name).toBe("Jo");
    expect(updated!.email).toBe("jo@acme.com");
  });

  it("returns null for a missing contact", async () => {
    ddb.on(GetCommand).resolves({});
    expect(await updateContact(USER, "app1", "nope", {})).toBeNull();
  });
});

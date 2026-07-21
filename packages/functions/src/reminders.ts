import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { listApplications } from "@crm/core/applications";
import { todayInTz } from "@crm/core/dates";
import { listDueFollowUps } from "@crm/core/followups";

const ses = new SESv2Client({});

/** Daily digest, one email per allowed user: their follow-ups due + their
 *  jobs saved but never applied to. Fired by EventBridge (see sst.config.ts).
 *  Skips users with nothing due. Sender is the owner's verified identity;
 *  each recipient address must also be SES-verified while in sandbox. */
export async function handler() {
  const tz = process.env.TIMEZONE ?? "America/Los_Angeles";
  const today = todayInTz(tz);
  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");

  const parse = (v: string | undefined) =>
    (v ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

  const allowed = parse(process.env.ALLOWED_EMAILS);
  const sender = allowed[0]; // first allowlist entry is the verified SES sender
  if (!sender) {
    console.log("No users configured — skipping");
    return;
  }
  // Recipients: the ReminderEmails subset when set, otherwise everyone.
  // Filtered against the allowlist so a typo can't mail a stranger.
  const requested = parse(process.env.REMINDER_EMAILS);
  const users = requested.length
    ? requested.filter((u) => allowed.includes(u))
    : allowed;

  for (const user of users) {
    // One user's failure (e.g. an unverified SES recipient) must not throw —
    // an errored async invocation gets retried by Lambda, re-sending every
    // email that already went out this run.
    try {
    const [due, applications] = await Promise.all([
      listDueFollowUps(user, today),
      listApplications(user),
    ]);
    const saved = applications.filter((a) => a.status === "SAVED");

    if (due.length === 0 && saved.length === 0) {
      console.log(`${user}: nothing due — skipping`);
      continue;
    }

    const lines: string[] = [`<h2>Job CRM — due today (${today})</h2>`];

    if (due.length) {
      lines.push(`<h3>Follow-ups due (${due.length})</h3><ul>`);
      for (const { interaction, application } of due) {
        const who = interaction.contactName ?? "someone";
        const at = application
          ? `${application.role} @ ${application.company}`
          : "an application";
        const overdue =
          interaction.nextFollowUpAt && interaction.nextFollowUpAt < today
            ? ` (was due ${interaction.nextFollowUpAt})`
            : "";
        const link =
          application && appUrl
            ? ` — <a href="${appUrl}/applications/${application.id}">open</a>`
            : "";
        lines.push(
          `<li>Follow up with <b>${who}</b> about ${at}${overdue}${link}</li>`,
        );
      }
      lines.push("</ul>");
    }

    if (saved.length) {
      lines.push(`<h3>Saved but not applied yet (${saved.length})</h3><ul>`);
      for (const a of saved) {
        const link = appUrl
          ? ` — <a href="${appUrl}/applications/${a.id}">open</a>`
          : "";
        lines.push(`<li><b>${a.role}</b> @ ${a.company}${link}</li>`);
      }
      lines.push("</ul>");
    }

    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: sender,
        Destination: { ToAddresses: [user] },
        Content: {
          Simple: {
            Subject: {
              Data: `Job CRM: ${due.length} follow-up${due.length === 1 ? "" : "s"} due, ${saved.length} saved`,
            },
            Body: { Html: { Data: lines.join("\n") } },
          },
        },
      }),
    );
    console.log(`${user}: sent ${due.length} follow-ups, ${saved.length} saved`);
    } catch (e) {
      console.error(`${user}: digest failed —`, e);
    }
  }
}

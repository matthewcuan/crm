import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { listApplications } from "@crm/core/applications";
import { todayInTz } from "@crm/core/dates";
import { listDueFollowUps } from "@crm/core/followups";

const ses = new SESv2Client({});

/** Daily digest: follow-ups due + jobs saved but never applied to.
 *  Fired by EventBridge (see sst.config.ts). Skips the email when empty. */
export async function handler() {
  const tz = process.env.TIMEZONE ?? "America/Los_Angeles";
  const today = todayInTz(tz);

  const [due, applications] = await Promise.all([
    listDueFollowUps(today),
    listApplications(),
  ]);
  const saved = applications.filter((a) => a.status === "SAVED");

  if (due.length === 0 && saved.length === 0) {
    console.log("Nothing due today — skipping email");
    return;
  }

  const appUrl = (process.env.APP_URL ?? "").replace(/\/$/, "");
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
      FromEmailAddress: process.env.ALLOWED_EMAIL!,
      Destination: { ToAddresses: [process.env.ALLOWED_EMAIL!] },
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
  console.log(`Sent reminder: ${due.length} follow-ups, ${saved.length} saved`);
}

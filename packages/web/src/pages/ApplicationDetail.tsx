import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { addDays } from "@crm/core/dates";
import { TEMPLATES } from "@crm/core/templates";
import {
  CHANNELS,
  CONTACT_TYPES,
  STATUSES,
  type ApplicationBundle,
  type Channel,
  type ContactType,
  type Direction,
  type Interaction,
  type Resume,
  type Status,
} from "@crm/core/types";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
} from "../components/ui";
import { api } from "../lib/api";
import { fmtDate, localToday } from "../lib/format";
import { STATUS_LABEL } from "./Applications";

const EMPTY_CONTACT = {
  name: "",
  type: "RECRUITER" as ContactType,
  linkedinUrl: "",
  email: "",
};

interface LogState {
  open: boolean;
  channel: Channel;
  direction: Direction;
  body: string;
  contactId: string;
  followUpDate: string;
  updateStatus: boolean;
}

export default function ApplicationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = localToday();

  const { data: bundle, isLoading } = useQuery({
    queryKey: ["application", id],
    queryFn: () => api.get<ApplicationBundle>(`/applications/${id}`),
    enabled: !!id,
  });
  const { data: resumeList } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => api.get<Resume[]>("/resumes"),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["application", id] });
    qc.invalidateQueries({ queryKey: ["applications"] });
    qc.invalidateQueries({ queryKey: ["followups"] });
  };

  // ---- local state ----
  const [notes, setNotes] = useState("");
  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [showContactForm, setShowContactForm] = useState(false);
  const [templateKey, setTemplateKey] = useState(TEMPLATES[0]!.key);
  const [draftResumeId, setDraftResumeId] = useState("");
  const [draftContactId, setDraftContactId] = useState("");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState<LogState>({
    open: false,
    channel: "LINKEDIN",
    direction: "SENT",
    body: "",
    contactId: "",
    followUpDate: addDays(today, 5),
    updateStatus: true,
  });

  useEffect(() => {
    if (bundle) setNotes(bundle.application.notes ?? "");
  }, [bundle]);

  // ---- mutations ----
  const patchApp = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch(`/applications/${id}`, patch),
    onSuccess: refresh,
  });
  const deleteApp = useMutation({
    mutationFn: () => api.del(`/applications/${id}`),
    onSuccess: () => navigate("/applications"),
  });
  const addContact = useMutation({
    mutationFn: () =>
      api.post(`/applications/${id}/contacts`, {
        name: contactForm.name,
        type: contactForm.type,
        linkedinUrl: contactForm.linkedinUrl || undefined,
        email: contactForm.email || undefined,
      }),
    onSuccess: () => {
      setContactForm(EMPTY_CONTACT);
      setShowContactForm(false);
      refresh();
    },
  });
  const removeContact = useMutation({
    mutationFn: (contactId: string) =>
      api.del(`/applications/${id}/contacts/${contactId}`),
    onSuccess: refresh,
  });
  const generate = useMutation({
    mutationFn: () =>
      api.post<{ message: string }>("/draft", {
        applicationId: id,
        templateKey,
        resumeId: draftResumeId || undefined,
        contactId: draftContactId || undefined,
      }),
    onSuccess: (data) => setDraft(data.message),
  });
  const addInteraction = useMutation({
    mutationFn: async () => {
      const contact = bundle?.contacts.find((ct) => ct.id === log.contactId);
      await api.post(`/applications/${id}/interactions`, {
        channel: log.channel,
        direction: log.direction,
        body: log.body,
        contactId: contact?.id,
        contactName: contact?.name,
        nextFollowUpAt: log.followUpDate || undefined,
      });
      // Logging outreach nudges the pipeline forward
      if (
        log.updateStatus &&
        log.direction === "SENT" &&
        (bundle?.application.status === "SAVED" ||
          bundle?.application.status === "APPLIED")
      ) {
        await api.patch(`/applications/${id}`, { status: "MESSAGED" });
      }
    },
    onSuccess: () => {
      setLog((l) => ({ ...l, open: false, body: "" }));
      refresh();
    },
  });
  const patchInteraction = useMutation({
    mutationFn: ({
      interactionId,
      patch,
    }: {
      interactionId: string;
      patch: Record<string, unknown>;
    }) => api.patch(`/applications/${id}/interactions/${interactionId}`, patch),
    onSuccess: refresh,
  });

  if (isLoading || !bundle) return <Spinner />;
  const { application: app, contacts, interactions } = bundle;

  const openLogModal = (body: string, direction: Direction = "SENT") =>
    setLog({
      open: true,
      channel: "LINKEDIN",
      direction,
      body,
      contactId: draftContactId,
      followUpDate: direction === "SENT" ? addDays(today, 5) : "",
      updateStatus: direction === "SENT",
    });

  const copyDraft = async () => {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* ---------- header ---------- */}
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold">{app.role}</h2>
            <div className="text-neutral-400">
              {app.company}
              {app.location ? ` · ${app.location}` : ""}
              {app.salary ? ` · ${app.salary}` : ""}
            </div>
            {app.jobUrl && (
              <a
                href={app.jobUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-blue-400 hover:underline"
              >
                View posting ↗
              </a>
            )}
          </div>
          <div className="w-40">
            <Field label="Status">
              <Select
                value={app.status}
                onChange={(e) =>
                  patchApp.mutate({ status: e.target.value as Status })
                }
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-40">
            <Field label="Resume version">
              <Select
                value={app.resumeId ?? ""}
                onChange={(e) =>
                  patchApp.mutate({ resumeId: e.target.value || null })
                }
              >
                <option value="">— none —</option>
                {(resumeList ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>

        {(app.keySkills ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {app.keySkills!.map((s) => (
              <Badge key={s} tone="blue">
                {s}
              </Badge>
            ))}
          </div>
        )}

        <div className="text-xs text-neutral-500">
          saved {fmtDate(app.dateSaved)}
          {app.dateApplied ? ` · applied ${fmtDate(app.dateApplied)}` : ""}
          {app.source ? ` · via ${app.source}` : ""}
        </div>

        <Field label="Notes">
          <div className="flex gap-2">
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {notes !== (app.notes ?? "") && (
              <Button
                variant="secondary"
                className="shrink-0 self-start"
                onClick={() => patchApp.mutate({ notes: notes || null })}
              >
                Save
              </Button>
            )}
          </div>
        </Field>
      </Card>

      {/* ---------- draft composer ---------- */}
      <Card className="space-y-3">
        <h3 className="font-semibold">Draft outreach</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Template">
            <Select
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
            >
              {TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Resume">
            <Select
              value={draftResumeId}
              onChange={(e) => setDraftResumeId(e.target.value)}
            >
              <option value="">auto (app's / default)</option>
              {(resumeList ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Contact">
            <Select
              value={draftContactId}
              onChange={(e) => setDraftContactId(e.target.value)}
            >
              <option value="">— none yet —</option>
              {contacts.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-neutral-500">
          {TEMPLATES.find((t) => t.key === templateKey)?.description}
        </p>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? "Drafting…" : "Generate draft"}
        </Button>
        {generate.isError && (
          <p className="text-sm text-red-400">
            {generate.error instanceof Error
              ? generate.error.message
              : "Draft failed"}
          </p>
        )}
        {draft && (
          <div className="space-y-2">
            <Textarea
              rows={6}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={copyDraft}>
                {copied ? "Copied ✓" : "Copy"}
              </Button>
              <Button onClick={() => openLogModal(draft)}>
                Log as sent…
              </Button>
              <span className="ml-auto text-xs text-neutral-500">
                {draft.length} chars
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* ---------- contacts ---------- */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Contacts</h3>
          <Button
            variant="secondary"
            onClick={() => setShowContactForm((v) => !v)}
          >
            {showContactForm ? "Cancel" : "+ Add contact"}
          </Button>
        </div>
        {showContactForm && (
          <div className="space-y-3 rounded-md bg-neutral-800/50 p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *">
                <Input
                  value={contactForm.name}
                  onChange={(e) =>
                    setContactForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </Field>
              <Field label="Type">
                <Select
                  value={contactForm.type}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                    setContactForm((f) => ({
                      ...f,
                      type: e.target.value as ContactType,
                    }))
                  }
                >
                  {CONTACT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace("_", " ").toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="LinkedIn URL">
                <Input
                  value={contactForm.linkedinUrl}
                  onChange={(e) =>
                    setContactForm((f) => ({
                      ...f,
                      linkedinUrl: e.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Email">
                <Input
                  value={contactForm.email}
                  onChange={(e) =>
                    setContactForm((f) => ({ ...f, email: e.target.value }))
                  }
                />
              </Field>
            </div>
            <Button
              onClick={() => addContact.mutate()}
              disabled={!contactForm.name || addContact.isPending}
            >
              Save contact
            </Button>
          </div>
        )}
        {contacts.length === 0 ? (
          <p className="text-sm text-neutral-400">
            No contacts yet. Find the recruiter or an engineer on the team and
            add them here — messages to people beat applications to portals.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {contacts.map((ct) => (
              <li key={ct.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{ct.name}</span>{" "}
                  <span className="text-xs text-neutral-400">
                    {ct.type.replace("_", " ").toLowerCase()}
                  </span>
                  <div className="flex gap-3 text-xs">
                    {ct.linkedinUrl && (
                      <a
                        className="text-blue-400 hover:underline"
                        href={ct.linkedinUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        LinkedIn ↗
                      </a>
                    )}
                    {ct.email && (
                      <span className="text-neutral-400">{ct.email}</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  onClick={() => removeContact.mutate(ct.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- interactions ---------- */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Activity</h3>
          <Button variant="secondary" onClick={() => openLogModal("", "SENT")}>
            + Log interaction
          </Button>
        </div>
        {interactions.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Nothing logged yet. Generate a draft above, send it manually, then
            "Log as sent" — the follow-up reminder is automatic.
          </p>
        ) : (
          <ul className="space-y-3">
            {interactions.map((it: Interaction) => (
              <li
                key={it.id}
                className="rounded-md border border-neutral-800 p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
                  <Badge tone={it.direction === "SENT" ? "blue" : "green"}>
                    {it.direction === "SENT" ? "→ sent" : "← received"}
                  </Badge>
                  <span>{it.channel.toLowerCase()}</span>
                  {it.contactName && <span>· {it.contactName}</span>}
                  <span>· {fmtDate(it.sentAt)}</span>
                  {it.outcome && <Badge>{it.outcome}</Badge>}
                  {it.nextFollowUpAt && (
                    <Badge tone={it.nextFollowUpAt <= today ? "red" : "amber"}>
                      follow up {it.nextFollowUpAt}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{it.body}</p>
                {it.nextFollowUpAt && (
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      onClick={() =>
                        patchInteraction.mutate({
                          interactionId: it.id,
                          patch: { nextFollowUpAt: addDays(today, 3) },
                        })
                      }
                    >
                      Snooze 3d
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        patchInteraction.mutate({
                          interactionId: it.id,
                          patch: {
                            nextFollowUpAt: null,
                            outcome: it.outcome ?? "followed-up",
                          },
                        })
                      }
                    >
                      Mark done
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- job description + danger zone ---------- */}
      {app.jobText && (
        <details className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Job description
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-400">
            {app.jobText}
          </p>
        </details>
      )}

      <div className="flex justify-between pb-8">
        <Link to="/applications" className="text-sm text-neutral-400 underline">
          ← Back to board
        </Link>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm(`Delete "${app.role} @ ${app.company}" and all its data?`))
              deleteApp.mutate();
          }}
        >
          Delete application
        </Button>
      </div>

      {/* ---------- log-interaction modal ---------- */}
      {log.open && (
        <Modal
          title="Log interaction"
          onClose={() => setLog((l) => ({ ...l, open: false }))}
        >
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Direction">
                <Select
                  value={log.direction}
                  onChange={(e) =>
                    setLog((l) => ({
                      ...l,
                      direction: e.target.value as Direction,
                    }))
                  }
                >
                  <option value="SENT">Sent by me</option>
                  <option value="RECEIVED">Received (reply)</option>
                </Select>
              </Field>
              <Field label="Channel">
                <Select
                  value={log.channel}
                  onChange={(e) =>
                    setLog((l) => ({
                      ...l,
                      channel: e.target.value as Channel,
                    }))
                  }
                >
                  {CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Contact">
                <Select
                  value={log.contactId}
                  onChange={(e) =>
                    setLog((l) => ({ ...l, contactId: e.target.value }))
                  }
                >
                  <option value="">— none —</option>
                  {contacts.map((ct) => (
                    <option key={ct.id} value={ct.id}>
                      {ct.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Follow up on (blank = none)">
                <Input
                  type="date"
                  value={log.followUpDate}
                  onChange={(e) =>
                    setLog((l) => ({ ...l, followUpDate: e.target.value }))
                  }
                />
              </Field>
            </div>
            <Field label="Message / notes *">
              <Textarea
                rows={5}
                value={log.body}
                onChange={(e) =>
                  setLog((l) => ({ ...l, body: e.target.value }))
                }
              />
            </Field>
            {log.direction === "SENT" &&
              (app.status === "SAVED" || app.status === "APPLIED") && (
                <label className="flex items-center gap-2 text-sm text-neutral-400">
                  <input
                    type="checkbox"
                    checked={log.updateStatus}
                    onChange={(e) =>
                      setLog((l) => ({ ...l, updateStatus: e.target.checked }))
                    }
                  />
                  Move status to "Messaged"
                </label>
              )}
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setLog((l) => ({ ...l, open: false }))}
              >
                Cancel
              </Button>
              <Button
                onClick={() => addInteraction.mutate()}
                disabled={!log.body || addInteraction.isPending}
              >
                {addInteraction.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { Application, Resume } from "@crm/core/types";
import {
  Button,
  Card,
  Field,
  Input,
  Select,
  Textarea,
} from "../components/ui";
import { api } from "../lib/api";

interface ExtractResponse {
  blocked?: boolean;
  reason?: string;
  fields?: {
    company: string;
    role: string;
    location: string | null;
    seniority: string | null;
    salary: string | null;
    keySkills: string[];
    source?: string;
  };
  jobText?: string;
}

const EMPTY_FORM = {
  company: "",
  role: "",
  location: "",
  seniority: "",
  salary: "",
  source: "",
  keySkills: "",
  notes: "",
  resumeId: "",
  jobUrl: "",
  jobText: "",
};

export default function NewApplication() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const resumes = useQuery({
    queryKey: ["resumes"],
    queryFn: () => api.get<Resume[]>("/resumes"),
  });

  const extract = useMutation({
    mutationFn: () =>
      api.post<ExtractResponse>(
        "/extract/job",
        mode === "url" ? { url } : { text },
      ),
    onSuccess: (data) => {
      if (data.blocked) {
        setNotice(
          `${data.reason ?? "Could not fetch that page."} Paste the job description text instead — the extraction works the same from there.`,
        );
        setMode("text");
        setForm((f) => ({
          ...f,
          jobUrl: url,
          source: data.fields?.source ?? f.source,
        }));
        return;
      }
      const fl = data.fields!;
      setNotice(null);
      setForm((f) => ({
        ...f,
        company: fl.company,
        role: fl.role,
        location: fl.location ?? "",
        seniority: fl.seniority ?? "",
        salary: fl.salary ?? "",
        source: fl.source ?? f.source,
        keySkills: fl.keySkills.join(", "),
        jobUrl: mode === "url" ? url : f.jobUrl,
        jobText: data.jobText ?? "",
      }));
    },
    onError: (e) =>
      setNotice(e instanceof Error ? e.message : "Extraction failed"),
  });

  const save = useMutation({
    mutationFn: () =>
      api.post<Application>("/applications", {
        company: form.company,
        role: form.role,
        jobUrl: form.jobUrl || (mode === "url" ? url : "") || undefined,
        jobText: form.jobText || (mode === "text" ? text : "") || undefined,
        location: form.location || undefined,
        seniority: form.seniority || undefined,
        salary: form.salary || undefined,
        source: form.source || undefined,
        keySkills: form.keySkills
          ? form.keySkills
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined,
        notes: form.notes || undefined,
        resumeId: form.resumeId || undefined,
      }),
    onSuccess: (a) => navigate(`/applications/${a.id}`),
    onError: (e) => setNotice(e instanceof Error ? e.message : "Save failed"),
  });

  const set =
    (key: keyof typeof EMPTY_FORM) =>
    (
      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    ) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold">Add a job</h2>

      <Card className="space-y-3">
        <div className="flex gap-2">
          <Button
            variant={mode === "url" ? "primary" : "secondary"}
            onClick={() => setMode("url")}
          >
            From link
          </Button>
          <Button
            variant={mode === "text" ? "primary" : "secondary"}
            onClick={() => setMode("text")}
          >
            Paste text
          </Button>
        </div>

        {mode === "url" ? (
          <div className="flex gap-2">
            <Input
              placeholder="https://boards.greenhouse.io/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Button
              className="shrink-0"
              onClick={() => extract.mutate()}
              disabled={!url || extract.isPending}
            >
              {extract.isPending ? "Extracting…" : "Extract"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Textarea
              rows={8}
              placeholder="Paste the job description text here…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              onClick={() => extract.mutate()}
              disabled={!text || extract.isPending}
            >
              {extract.isPending ? "Extracting…" : "Extract"}
            </Button>
          </div>
        )}

        {notice && (
          <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-800">
            {notice}
          </p>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Company *">
            <Input value={form.company} onChange={set("company")} />
          </Field>
          <Field label="Role *">
            <Input value={form.role} onChange={set("role")} />
          </Field>
          <Field label="Location">
            <Input value={form.location} onChange={set("location")} />
          </Field>
          <Field label="Seniority">
            <Input value={form.seniority} onChange={set("seniority")} />
          </Field>
          <Field label="Salary">
            <Input value={form.salary} onChange={set("salary")} />
          </Field>
          <Field label="Source">
            <Input value={form.source} onChange={set("source")} />
          </Field>
        </div>
        <Field label="Key skills (comma separated)">
          <Input value={form.keySkills} onChange={set("keySkills")} />
        </Field>
        <Field label="Resume version">
          <Select value={form.resumeId} onChange={set("resumeId")}>
            <option value="">— none —</option>
            {(resumes.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {r.isDefault ? " (default)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes">
          <Textarea rows={3} value={form.notes} onChange={set("notes")} />
        </Field>
        <div className="flex justify-end">
          <Button
            onClick={() => save.mutate()}
            disabled={!form.company || !form.role || save.isPending}
          >
            {save.isPending ? "Saving…" : "Save application"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

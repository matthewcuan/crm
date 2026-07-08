import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Resume } from "@crm/core/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Spinner,
  Textarea,
} from "../components/ui";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";

export default function Resumes() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: () => api.get<Resume[]>("/resumes"),
  });

  const [label, setLabel] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["resumes"] });

  async function addResume() {
    setBusy(true);
    setError(null);
    try {
      if (file) {
        // presigned URL → PUT the PDF straight to S3 → server extracts + analyzes
        const { url, key } = await api.post<{ url: string; key: string }>(
          "/resumes/upload-url",
          { fileName: file.name },
        );
        const put = await fetch(url, {
          method: "PUT",
          headers: { "content-type": "application/pdf" },
          body: file,
        });
        if (!put.ok) throw new Error("PDF upload failed");
        await api.post("/resumes", { label, s3Key: key, fileName: file.name });
      } else {
        await api.post("/resumes", { label, text });
      }
      setLabel("");
      setText("");
      setFile(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add resume");
    } finally {
      setBusy(false);
    }
  }

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api.patch(`/resumes/${id}`, patch),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/resumes/${id}`),
    onSuccess: refresh,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold">Resume versions</h2>
      <p className="-mt-4 text-sm text-slate-500">
        Keep one version per positioning (e.g. Backend / Security / Full-stack).
        Skills are extracted automatically and used to tailor outreach drafts.
      </p>

      <Card className="space-y-3">
        <Field label="Label *">
          <Input
            placeholder="e.g. Backend, Security/PKI, Full-stack"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </Field>
        <Field label="PDF file">
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-700"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </Field>
        {!file && (
          <Field label="…or paste resume text">
            <Textarea
              rows={6}
              placeholder="Paste your resume text here"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
        )}
        {error && (
          <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end">
          <Button
            onClick={addResume}
            disabled={!label || (!file && !text.trim()) || busy}
          >
            {busy ? "Extracting skills…" : "Add resume"}
          </Button>
        </div>
      </Card>

      {isLoading ? (
        <Spinner />
      ) : (data ?? []).length === 0 ? (
        <EmptyState>
          No resumes yet — add one above so drafts can speak to your actual
          skills.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {(data ?? []).map((r) => (
            <Card key={r.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.label}</span>
                {r.isDefault && <Badge tone="green">default</Badge>}
                <span className="ml-auto text-xs text-slate-400">
                  {r.fileName ?? "pasted text"} · {fmtDate(r.createdAt)}
                </span>
              </div>
              {r.summary && (
                <p className="text-sm italic text-slate-600">{r.summary}</p>
              )}
              <div className="flex flex-wrap gap-1">
                {r.skills.map((s) => (
                  <Badge key={s} tone="blue">
                    {s}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                {!r.isDefault && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      update.mutate({ id: r.id, patch: { isDefault: true } })
                    }
                  >
                    Make default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`Delete resume "${r.label}"?`))
                      remove.mutate(r.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

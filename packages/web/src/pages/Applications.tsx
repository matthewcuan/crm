import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { STATUSES, type Application, type Status } from "@crm/core/types";
import {
  Button,
  Card,
  EmptyState,
  Select,
  Spinner,
} from "../components/ui";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";

const ACTIVE: Status[] = [
  "SAVED",
  "APPLIED",
  "MESSAGED",
  "FOLLOWED_UP",
  "SCREEN",
  "INTERVIEW",
  "OFFER",
];
const ARCHIVED: Status[] = ["REJECTED", "CLOSED"];

export const STATUS_LABEL: Record<Status, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  MESSAGED: "Messaged",
  FOLLOWED_UP: "Followed up",
  SCREEN: "Screen",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  CLOSED: "Closed",
};

export default function Applications() {
  const qc = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.get<Application[]>("/applications"),
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api.patch(`/applications/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["applications"] }),
  });

  if (isLoading) return <Spinner />;
  const apps = data ?? [];
  const archived = apps.filter((a) => ARCHIVED.includes(a.status));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Applications</h2>
        <Link to="/applications/new">
          <Button>+ Add job</Button>
        </Link>
      </div>

      {apps.length === 0 ? (
        <EmptyState>
          No applications yet. Paste a job link to get started.
        </EmptyState>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ACTIVE.map((status) => {
            const col = apps.filter((a) => a.status === status);
            return (
              <div key={status} className="w-64 shrink-0">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {STATUS_LABEL[status]} ({col.length})
                </div>
                <div className="space-y-2">
                  {col.map((a) => (
                    <Card key={a.id} className="!p-3">
                      <Link to={`/applications/${a.id}`} className="block">
                        <div className="text-sm font-medium hover:underline">
                          {a.role}
                        </div>
                        <div className="text-xs text-neutral-400">{a.company}</div>
                        <div className="mt-1 text-[11px] text-neutral-500">
                          saved {fmtDate(a.dateSaved)}
                        </div>
                      </Link>
                      <Select
                        className="mt-2 !py-1 !text-xs"
                        value={a.status}
                        onChange={(e) =>
                          move.mutate({
                            id: a.id,
                            status: e.target.value as Status,
                          })
                        }
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </Select>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div>
        <button
          className="text-sm text-neutral-400 underline"
          onClick={() => setShowArchived((v) => !v)}
        >
          {showArchived ? "Hide" : "Show"} archived ({archived.length})
        </button>
        {showArchived && archived.length > 0 && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((a) => (
              <Link key={a.id} to={`/applications/${a.id}`}>
                <Card className="!p-3 opacity-70">
                  <div className="text-sm font-medium">{a.role}</div>
                  <div className="text-xs text-neutral-400">
                    {a.company} · {STATUS_LABEL[a.status]}
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

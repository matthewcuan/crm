import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { STATUSES, type Application, type Status } from "@crm/core/types";
import { EmptyState, Spinner, StatusDot } from "../components/ui";
import { api } from "../lib/api";
import { fmtDate } from "../lib/format";
import { STATUS_LABEL } from "../lib/status";

export default function Applications() {
  const [collapsed, setCollapsed] = useState<Partial<Record<Status, boolean>>>(
    {},
  );

  const { data, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.get<Application[]>("/applications"),
  });

  if (isLoading) return <Spinner />;
  const apps = data ?? [];
  const active = apps.filter(
    (a) => a.status !== "REJECTED" && a.status !== "CLOSED",
  ).length;

  // One section per status that has applications, in pipeline order
  const sections = STATUSES.map((status) => ({
    status,
    items: apps.filter((a) => a.status === status),
  })).filter((s) => s.items.length > 0);

  return (
    <div>
      <div className="flex items-end justify-between pb-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Applications</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500">
            {apps.length} tracked · {active} active
          </p>
        </div>
        <Link
          to="/applications/new"
          title="Add a job"
          className="grid h-9 w-9 place-items-center rounded-full bg-neutral-100 pb-0.5 text-xl leading-none text-neutral-900 hover:bg-white"
        >
          +
        </Link>
      </div>

      {apps.length === 0 ? (
        <EmptyState title="Nothing tracked yet">
          Paste a job link to get started.
        </EmptyState>
      ) : (
        <>
          {/* status summary chips */}
          <div className="flex gap-2 overflow-x-auto pb-4 [scrollbar-width:none]">
            {sections.map(({ status, items }) => (
              <div
                key={status}
                className="flex flex-none items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1.5"
              >
                <StatusDot status={status} />
                <span className="whitespace-nowrap text-xs text-neutral-400">
                  {STATUS_LABEL[status]}
                </span>
                <span className="text-xs font-semibold tabular-nums">
                  {items.length}
                </span>
              </div>
            ))}
          </div>

          {/* collapsible sections */}
          {sections.map(({ status, items }) => (
            <section key={status}>
              <button
                className="flex w-full items-center gap-2.5 py-2.5 text-left"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [status]: !c[status] }))
                }
              >
                <StatusDot status={status} />
                <span className="text-[13px] font-semibold text-neutral-200">
                  {STATUS_LABEL[status]}
                </span>
                <span className="text-xs text-neutral-500 tabular-nums">
                  {items.length}
                </span>
                <span
                  className={`ml-auto text-[10px] text-neutral-600 transition-transform ${
                    collapsed[status] ? "-rotate-90" : ""
                  }`}
                >
                  ▼
                </span>
              </button>
              {!collapsed[status] && (
                <div className="flex flex-col gap-2 pb-2">
                  {items.map((a) => (
                    <Link
                      key={a.id}
                      to={`/applications/${a.id}`}
                      className="rounded-[14px] border border-neutral-800 bg-neutral-900 px-3.5 py-3 hover:border-neutral-600"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold tracking-tight">
                            {a.role}
                          </div>
                          <div className="mt-0.5 text-[13px] text-neutral-400">
                            {a.company}
                          </div>
                        </div>
                        <span className="text-[17px] leading-none text-neutral-600">
                          ›
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center gap-2 text-xs">
                        {a.salary && (
                          <>
                            <span className="text-neutral-300 tabular-nums">
                              {a.salary}
                            </span>
                            <span className="h-[3px] w-[3px] flex-none rounded-full bg-neutral-700" />
                          </>
                        )}
                        <span className="text-neutral-500">
                          {a.status === "SAVED" ? "saved" : "updated"}{" "}
                          {fmtDate(a.dateApplied ?? a.dateSaved)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  );
}

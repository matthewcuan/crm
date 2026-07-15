import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type PointerEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { STATUSES, type Application, type Status } from "@crm/core/types";
import { EmptyState, Spinner, StatusDot, StatusPill } from "../components/ui";
import { api } from "../lib/api";
import { fmtDate, lastTouched } from "../lib/format";
import { STATUS_LABEL } from "../lib/status";

type View = "grouped" | "feed";
const VIEW_KEY = "crm_apps_view";

const ADVANCE_PATH: Status[] = [
  "SAVED",
  "APPLIED",
  "MESSAGED",
  "FOLLOWED_UP",
  "SCREEN",
  "INTERVIEW",
  "OFFER",
];

/** What swiping a feed card left offers, per the design:
 *  active stages advance down the pipeline; terminal ones archive/restore. */
function feedAction(status: Status): {
  label: string;
  next: Status;
  advance: boolean;
} {
  if (status === "REJECTED" || status === "CLOSED") {
    return { label: "Restore", next: "SAVED", advance: false };
  }
  if (status === "OFFER") {
    return { label: "Archive", next: "CLOSED", advance: false };
  }
  const i = ADVANCE_PATH.indexOf(status);
  return { label: "Advance", next: ADVANCE_PATH[i + 1]!, advance: true };
}

const OPEN_PX = -88; // action width revealed when a row is swiped open

function FeedRow({
  app,
  onMove,
}: {
  app: Application;
  onMove: (id: string, status: Status) => void;
}) {
  const navigate = useNavigate();
  const [dx, setDx] = useState(0);
  const [open, setOpen] = useState(false);
  const dragging = useRef(false);
  const startX = useRef(0);
  const moved = useRef(false);

  const action = feedAction(app.status);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX - (open ? OPEN_PX : 0);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* older browsers */
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const d = Math.max(-96, Math.min(0, e.clientX - startX.current));
    if (Math.abs(d - (open ? OPEN_PX : 0)) > 5) moved.current = true;
    setDx(d);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const willOpen = dx < -50;
    setOpen(willOpen);
    setDx(willOpen ? OPEN_PX : 0);
  };
  const onClick = () => {
    if (moved.current) return; // was a drag, not a tap
    if (open) {
      setOpen(false);
      setDx(0);
      return;
    }
    navigate(`/applications/${app.id}`);
  };

  return (
    <div className="relative mb-2 overflow-hidden rounded-[14px]">
      <button
        className={`absolute bottom-0 right-0 top-0 flex w-[88px] items-center justify-center rounded-[14px] text-xs font-semibold ${
          action.advance
            ? "bg-green-400/15 text-green-300"
            : "bg-neutral-800 text-neutral-400"
        }`}
        onClick={() => {
          setOpen(false);
          setDx(0);
          onMove(app.id, action.next);
        }}
      >
        {action.label}
      </button>
      <div
        className="relative flex cursor-pointer touch-pan-y items-center gap-3 rounded-[14px] border border-neutral-800 bg-neutral-900 px-3.5 py-3"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging.current ? "none" : "transform .18s ease",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      >
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold tracking-tight">
            {app.role}
          </div>
          <div className="mt-0.5 text-[13px] text-neutral-400">
            {app.company}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {app.salary && (
              <>
                <span className="text-neutral-300 tabular-nums">
                  {app.salary}
                </span>
                <span className="h-[3px] w-[3px] flex-none rounded-full bg-neutral-700" />
              </>
            )}
            <span className="text-neutral-500">
              {app.status === "SAVED" ? "saved" : "updated"}{" "}
              {fmtDate(lastTouched(app))}
            </span>
          </div>
        </div>
        <StatusPill status={app.status} />
      </div>
    </div>
  );
}

export default function Applications() {
  const qc = useQueryClient();
  const [view, setViewState] = useState<View>(
    () => (localStorage.getItem(VIEW_KEY) as View) ?? "grouped",
  );
  const setView = (v: View) => {
    localStorage.setItem(VIEW_KEY, v);
    setViewState(v);
  };
  const [collapsed, setCollapsed] = useState<Partial<Record<Status, boolean>>>(
    {},
  );

  const { data, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.get<Application[]>("/applications"),
  });

  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api.patch(`/applications/${id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["followups"] });
    },
  });

  if (isLoading) return <Spinner />;
  const apps = data ?? [];
  const active = apps.filter(
    (a) => a.status !== "REJECTED" && a.status !== "CLOSED",
  ).length;

  const sections = STATUSES.map((status) => ({
    status,
    items: apps.filter((a) => a.status === status),
  })).filter((s) => s.items.length > 0);

  const recent = [...apps].sort((a, b) =>
    lastTouched(b).localeCompare(lastTouched(a)),
  );

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
          {/* Grouped | Feed segmented toggle */}
          <div className="mb-4 flex rounded-[11px] border border-neutral-800 bg-neutral-900 p-[3px]">
            {(["grouped", "feed"] as const).map((v) => (
              <button
                key={v}
                className={`flex-1 rounded-lg py-1.5 text-[13px] font-semibold capitalize transition-colors ${
                  view === v
                    ? "bg-[#2e2e2e] text-neutral-100"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
                onClick={() => setView(v)}
              >
                {v}
              </button>
            ))}
          </div>

          {view === "grouped" && (
            <>
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
                              {fmtDate(lastTouched(a))}
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

          {view === "feed" && (
            <>
              <div className="flex items-center gap-1.5 pb-3 text-[11px] text-neutral-600">
                <span>←</span> swipe a card to advance its stage
              </div>
              {recent.map((a) => (
                <FeedRow
                  key={a.id}
                  app={a}
                  onMove={(id, status) => move.mutate({ id, status })}
                />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { addDays } from "@crm/core/dates";
import type { Application, DueFollowUp } from "@crm/core/types";
import { Button, EmptyState, Spinner, StatusPill } from "../components/ui";
import { api } from "../lib/api";
import { fmtDate, localToday } from "../lib/format";

function GroupLabel({
  children,
  count,
  warn = false,
}: {
  children: string;
  count: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`flex items-center pb-2.5 text-xs font-semibold uppercase tracking-wider ${
        warn ? "text-red-300" : "text-neutral-400"
      }`}
    >
      {children}
      <span className="ml-auto text-[11px] font-medium normal-case tracking-normal text-neutral-600 tabular-nums">
        {count}
      </span>
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const today = localToday();

  const followups = useQuery({
    queryKey: ["followups"],
    queryFn: () => api.get<DueFollowUp[]>(`/followups?today=${today}`),
  });
  const applications = useQuery({
    queryKey: ["applications"],
    queryFn: () => api.get<Application[]>("/applications"),
  });

  const updateFollowUp = useMutation({
    mutationFn: ({
      appId,
      id,
      patch,
    }: {
      appId: string;
      id: string;
      patch: Record<string, unknown>;
    }) => api.patch(`/applications/${appId}/interactions/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["followups"] }),
  });

  if (followups.isLoading || applications.isLoading) return <Spinner />;

  const due = followups.data ?? [];
  const saved = (applications.data ?? []).filter((a) => a.status === "SAVED");
  const count = due.length + saved.length;

  return (
    <div>
      <div className="flex items-end justify-between pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today</h1>
          <p className="mt-0.5 text-[13px] text-neutral-500">
            {count > 0
              ? `${count} thing${count === 1 ? "" : "s"} need attention`
              : "Nothing due"}
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

      {count === 0 && (
        <EmptyState title="You're all caught up">
          No follow-ups or actions due today.
        </EmptyState>
      )}

      {due.length > 0 && (
        <section className="pt-5">
          <GroupLabel warn count={due.length}>
            Needs follow-up
          </GroupLabel>
          <div className="flex flex-col gap-2.5">
            {due.map(({ interaction, application }) => {
              const overdue =
                !!interaction.nextFollowUpAt &&
                interaction.nextFollowUpAt < today;
              return (
                <div
                  key={interaction.id}
                  className={`flex flex-col gap-3 rounded-[14px] border bg-neutral-900 p-3.5 ${
                    overdue ? "border-red-400/35" : "border-neutral-800"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={
                        application
                          ? `/applications/${application.id}`
                          : "/applications"
                      }
                      className="min-w-0"
                    >
                      <div className="text-[15px] font-semibold tracking-tight">
                        {application?.role ?? "Unknown role"}
                      </div>
                      <div className="mt-0.5 text-[13px] text-neutral-400">
                        {application?.company ?? ""}
                        {interaction.contactName
                          ? `${application ? " · " : ""}${interaction.contactName}`
                          : ""}
                      </div>
                      <div
                        className={`mt-1 text-xs ${
                          overdue ? "text-red-300" : "text-neutral-500"
                        }`}
                      >
                        {overdue
                          ? `Overdue — was due ${interaction.nextFollowUpAt}`
                          : "Follow-up due today"}
                      </div>
                    </Link>
                    {application && <StatusPill status={application.status} />}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={() =>
                        updateFollowUp.mutate({
                          appId: interaction.applicationId,
                          id: interaction.id,
                          patch: {
                            nextFollowUpAt: null,
                            outcome: interaction.outcome ?? "followed-up",
                          },
                        })
                      }
                    >
                      Done
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        updateFollowUp.mutate({
                          appId: interaction.applicationId,
                          id: interaction.id,
                          patch: { nextFollowUpAt: addDays(today, 3) },
                        })
                      }
                    >
                      Snooze 3d
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {saved.length > 0 && (
        <section className="pt-6">
          <GroupLabel count={saved.length}>Ready to reach out</GroupLabel>
          <div className="flex flex-col gap-2.5">
            {saved.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-[14px] border border-neutral-800 bg-neutral-900 p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/applications/${a.id}`} className="min-w-0">
                    <div className="text-[15px] font-semibold tracking-tight">
                      {a.role}
                    </div>
                    <div className="mt-0.5 text-[13px] text-neutral-400">
                      {a.company}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Saved {fmtDate(a.dateSaved)} — draft outreach or apply
                    </div>
                  </Link>
                  <StatusPill status={a.status} />
                </div>
                <div className="flex gap-2">
                  <Link to={`/applications/${a.id}`} className="flex-1">
                    <Button className="w-full">Draft outreach</Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

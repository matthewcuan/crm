import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { addDays } from "@crm/core/dates";
import type { Application, DueFollowUp } from "@crm/core/types";
import { Badge, Button, Card, EmptyState, Spinner } from "../components/ui";
import { api } from "../lib/api";
import { localToday } from "../lib/format";

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

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          Follow-ups due
          {due.length > 0 && <Badge tone="red">{due.length}</Badge>}
        </h2>
        {due.length === 0 ? (
          <EmptyState>
            Nothing due. 🎉 Log outreach with a follow-up date and it will show
            up here.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {due.map(({ interaction, application }) => (
              <Card
                key={interaction.id}
                className="flex flex-wrap items-center gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {interaction.contactName ?? "Someone"}{" "}
                    <span className="font-normal text-neutral-400">
                      ·{" "}
                      {application
                        ? `${application.role} @ ${application.company}`
                        : "unknown role"}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-sm text-neutral-400">
                    {interaction.body}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    due {interaction.nextFollowUpAt}
                    {interaction.nextFollowUpAt &&
                      interaction.nextFollowUpAt < today && (
                        <span className="font-medium text-red-400">
                          {" "}
                          · overdue
                        </span>
                      )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {application && (
                    <Link to={`/applications/${application.id}`}>
                      <Button variant="secondary">Open</Button>
                    </Link>
                  )}
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
                  <Button
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
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
          Saved — not applied yet
          {saved.length > 0 && <Badge tone="amber">{saved.length}</Badge>}
        </h2>
        {saved.length === 0 ? (
          <EmptyState>
            No saved jobs waiting.{" "}
            <Link className="underline" to="/applications/new">
              Add one
            </Link>
            .
          </EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((a) => (
              <Link key={a.id} to={`/applications/${a.id}`}>
                <Card className="transition-colors hover:border-neutral-600">
                  <div className="font-medium">{a.role}</div>
                  <div className="text-sm text-neutral-400">{a.company}</div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

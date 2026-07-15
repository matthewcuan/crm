import { useQuery } from "@tanstack/react-query";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import type { DueFollowUp } from "@crm/core/types";
import { api } from "../lib/api";
import { clearToken, getToken } from "../lib/auth";
import { localToday } from "../lib/format";

export function Layout() {
  const navigate = useNavigate();
  const hasToken = !!getToken();

  // Count shown on the Today tab (shares the dashboard's cache key)
  const { data: due } = useQuery({
    queryKey: ["followups"],
    queryFn: () => api.get<DueFollowUp[]>(`/followups?today=${localToday()}`),
    enabled: hasToken,
  });

  if (!hasToken) return <Navigate to="/login" replace />;

  const tabs = [
    { to: "/", label: "Today", count: due?.length ?? 0 },
    { to: "/applications", label: "Applications" },
    { to: "/resumes", label: "Resumes" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-neutral-800">
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <div className="flex items-center justify-between pb-3">
            <span className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <span className="grid h-5 w-5 place-items-center rounded-md bg-neutral-100 text-xs font-bold text-neutral-900">
                J
              </span>
              JobCRM
            </span>
            <button
              title="Sign out"
              className="grid h-8 w-8 place-items-center rounded-full border border-neutral-700 bg-neutral-800 text-xs font-semibold text-neutral-300 hover:border-neutral-500"
              onClick={() => {
                clearToken();
                navigate("/login");
              }}
            >
              M
            </button>
          </div>
          <nav className="flex gap-6 overflow-x-auto">
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) =>
                  `-mb-px whitespace-nowrap border-b-2 pb-3 text-sm font-medium ${
                    isActive
                      ? "border-neutral-100 text-neutral-100"
                      : "border-transparent text-neutral-500 hover:text-neutral-300"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {t.label}
                    {t.count !== undefined && t.count > 0 && (
                      <span
                        className={`ml-1.5 text-[11px] tabular-nums ${
                          isActive ? "text-neutral-400" : "text-neutral-600"
                        }`}
                      >
                        {t.count}
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}

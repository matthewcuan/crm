import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearToken, getToken } from "../lib/auth";

const TABS = [
  { to: "/", label: "Today" },
  { to: "/applications", label: "Applications" },
  { to: "/resumes", label: "Resumes" },
];

export function Layout() {
  const navigate = useNavigate();
  if (!getToken()) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <span className="text-lg font-bold">🎯 JobCRM</span>
          <nav className="flex gap-1">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <button
            className="ml-auto text-sm text-slate-500 hover:text-slate-900"
            onClick={() => {
              clearToken();
              navigate("/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}

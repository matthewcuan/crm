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
      {/* Wraps to two rows on narrow screens: logo + sign-out on top, tabs below */}
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <span className="order-1 font-semibold">JobCRM</span>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-2 sm:w-auto">
            {TABS.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.to === "/"}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium ${
                    isActive
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-400 hover:text-neutral-100"
                  }`
                }
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
          <button
            className="order-2 ml-auto text-sm text-neutral-400 hover:text-neutral-100 sm:order-3"
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

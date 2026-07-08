import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getToken, setToken } from "../lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;

    // The GSI script loads async — poll until it's ready, then render the button
    const tryInit = () => {
      if (cancelled) return;
      const google = window.google;
      if (!google || !buttonRef.current) {
        setTimeout(tryInit, 100);
        return;
      }
      google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          try {
            const { token } = await api.post<{ token: string }>(
              "/auth/google",
              { credential },
            );
            setToken(token);
            navigate("/", { replace: true });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign-in failed");
          }
        },
      });
      google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: 280,
      });
    };
    tryInit();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-80 rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold">🎯 JobCRM</h1>
        <p className="mb-6 mt-1 text-sm text-slate-500">
          Your job search, organized.
        </p>
        <div ref={buttonRef} className="flex justify-center" />
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}

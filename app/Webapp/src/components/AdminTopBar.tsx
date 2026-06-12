"use client";

// Thin top bar shown on authenticated admin pages: displays the signed-in
// admin and a logout button. Hidden on the login page itself. The session
// (httpOnly cookie) is verified server-side by middleware + the backend; this
// bar only reads /admin-auth/me (through the proxy) for a display name.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export default function AdminTopBar() {
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const onLoginPage = pathname === "/admin/login";

  useEffect(() => {
    if (onLoginPage) return;
    let cancelled = false;
    fetch("/api/backend/admin-auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.username) setUsername(data.username);
      })
      .catch(() => {
        /* non-fatal: middleware already gates access */
      });
    return () => {
      cancelled = true;
    };
  }, [onLoginPage, pathname]);

  if (onLoginPage) return null;

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin-auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/admin/login");
    }
  }

  return (
    <div className="w-full bg-white border-b border-gray-200">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
          Admin
        </span>
        <div className="flex items-center gap-3">
          {username && (
            <span className="text-sm text-gray-600">
              Signed in as <span className="font-semibold">{username}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-60"
          >
            {loggingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </div>
  );
}

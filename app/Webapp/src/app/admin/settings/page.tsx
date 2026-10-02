"use client";

// Admin settings page — allows the signed-in admin to change their own
// password without requiring developer intervention.
import { useEffect, useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

interface AdminUser {
  id: number;
  username: string;
  role: string;
  force_password_change: boolean;
}

export default function AdminSettingsPage() {
  const [user, setUser]               = useState<AdminUser | null>(null);
  const [currentPw, setCurrentPw]     = useState("");
  const [newPw, setNewPw]             = useState("");
  const [confirmPw, setConfirmPw]     = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew]         = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState(false);

  // Load the current admin's identity so we can address the PATCH correctly.
  useEffect(() => {
    fetch("/api/backend/admin-auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.id) setUser(data as AdminUser);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPw !== confirmPw) {
      setError("New passwords do not match.");
      return;
    }
    if (newPw.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (!user) {
      setError("Could not determine current user. Please reload.");
      return;
    }

    setSubmitting(true);
    try {
      // Verify the current password by attempting a login first.
      const verifyRes = await fetch("/api/admin-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user.username, password: currentPw }),
      });
      if (!verifyRes.ok) {
        setError("Current password is incorrect.");
        return;
      }

      // Current password confirmed — apply the change.
      const patchRes = await fetch(`/api/backend/auth/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPw }),
      });
      if (!patchRes.ok) {
        const data = await patchRes.json().catch(() => ({}));
        setError(typeof data?.detail === "string" ? data.detail : "Failed to update password.");
        return;
      }

      setSuccess(true);
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Settings</h1>
        {user && (
          <p className="text-sm text-gray-500 mb-6">
            Signed in as <span className="font-semibold text-gray-700">{user.username}</span>
            <span className="ml-2 text-xs text-gray-400">({user.role})</span>
          </p>
        )}

        {user?.force_password_change && !success && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              <span aria-hidden>⚠️</span>{" "}
              You are using a temporary password. Please change it now before continuing.
            </p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Change password</h2>

          {success && (
            <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              Password changed successfully.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current password */}
            <div>
              <label htmlFor="current-pw" className="block text-sm font-medium text-gray-700">
                Current password
              </label>
              <div className="relative mt-1">
                <input
                  id="current-pw"
                  type={showCurrent ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  aria-label={showCurrent ? "Hide" : "Show"}
                >
                  {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New password */}
            <div>
              <label htmlFor="new-pw" className="block text-sm font-medium text-gray-700">
                New password
              </label>
              <div className="relative mt-1">
                <input
                  id="new-pw"
                  type={showNew ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  aria-label={showNew ? "Hide" : "Show"}
                >
                  {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">Minimum 8 characters.</p>
            </div>

            {/* Confirm password */}
            <div>
              <label htmlFor="confirm-pw" className="block text-sm font-medium text-gray-700">
                Confirm new password
              </label>
              <input
                id="confirm-pw"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting || !user}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

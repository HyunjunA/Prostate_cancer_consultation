// Layout for all /admin pages. Renders the admin top bar (logout) above the
// page content. Access is enforced by src/middleware.ts (cookie gate) and the
// backend (per-request admin check); this layout is purely presentational.
import { type ReactNode } from "react";

import AdminTopBar from "@/components/AdminTopBar";

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AdminTopBar />
      {children}
    </div>
  );
}

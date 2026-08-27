// Physician roster. Behind the admin gate (src/middleware.ts covers
// /admin/:path*); the ?doctorid= dashboard URLs it links to stay public.
import AdminPhysicianPicker from "@/components/AdminPhysicianPicker";

export default function AdminPhysiciansPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <AdminPhysicianPicker />
    </div>
  );
}

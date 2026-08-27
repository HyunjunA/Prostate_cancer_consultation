// Patient records index. Behind the admin gate (src/middleware.ts covers
// /admin/:path*); the patient URLs it links to stay public.
import AdminPatientPicker from "@/components/AdminPatientPicker";

export default function AdminPatientsPage() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <AdminPatientPicker />
    </div>
  );
}

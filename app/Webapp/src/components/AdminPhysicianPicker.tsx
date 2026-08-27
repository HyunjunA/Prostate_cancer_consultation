"use client";

/**
 * Physician picker for /admin/physicians — lists doctors (from
 * /api/backend/doctor/list) and links each to the public ?doctorid=<hashed>
 * dashboard URL.
 *
 * Moved out of the public home page (src/app/page.tsx, where it was reached
 * via ?select=physician) on 2026-08-27: the roster is a browsable index, so it
 * now sits behind the admin gate. A physician's own ?doctorid= link stays
 * public — that is the link handed out from deid_mapping.csv.
 */

import { useEffect, useState } from "react";

interface Doctor {
  doctor_id: string;
  patient_count: number;
}

export default function AdminPhysicianPicker() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/backend/doctor/list`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDoctors(d.doctors || []);
      })
      .catch((e) => console.error("[AdminPhysicianPicker] load failed:", e))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Physician View</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose a doctor to view only their patients.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading doctors…</p>
      ) : doctors.length === 0 ? (
        <p className="text-sm text-slate-500">No doctors found.</p>
      ) : (
        <ul className="space-y-2">
          {doctors.map((d) => (
            <li key={d.doctor_id}>
              <a
                href={`/?doctorid=${encodeURIComponent(d.doctor_id)}`}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition-all hover:bg-slate-50"
              >
                <span className="font-medium text-slate-800">Doctor {d.doctor_id}</span>
                <span className="text-xs text-slate-500">
                  {d.patient_count} patient{d.patient_count !== 1 ? "s" : ""}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

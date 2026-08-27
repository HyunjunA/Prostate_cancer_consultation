"use client";

/**
 * Nav card shared by the two admin hubs (/admin and /admin/tracking).
 *
 * Both pages rendered this markup separately until 2026-08-27, which is how
 * the Upload Transcript card ended up duplicated across them.
 */

import Link from "next/link";

interface Props {
  href: string;
  title: string;
  description: string;
  cta: string;
  /** Tailwind gradient stops for the accent bar, e.g. "from-blue-500 to-indigo-500". */
  color: string;
  /** Extra classes for the card itself — used by the full-width primary card. */
  className?: string;
}

export default function AdminHubCard({
  href,
  title,
  description,
  cta,
  color,
  className = "",
}: Props) {
  return (
    <Link
      href={href}
      className={`group block bg-white rounded-xl shadow hover:shadow-lg transition-shadow overflow-hidden ${className}`}
    >
      <div className={`h-2 bg-gradient-to-r ${color}`} />
      <div className="p-6">
        <h2 className="text-lg font-semibold text-slate-900 group-hover:text-indigo-600">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{description}</p>
        <span className="mt-4 inline-block text-xs text-indigo-600 group-hover:underline">
          {cta}
        </span>
      </div>
    </Link>
  );
}

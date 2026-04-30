import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
// import { PostHogProvider } from "./providers/PostHogProvider"; // PostHog disabled — not in use

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "COMPASS",
  description:
    "COMPASS — COMmunication of Prostate cAncer Shared deciSions. " +
    "Research dashboard for analyzing physician-patient consultation transcripts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        {/* COMPASS brand header is rendered inside `page.tsx` only when the
            user is on the selection landing screen — Patient first /
            Patient follow-up / Doctor views deliberately omit it for a
            cleaner workspace. The footer stays global so the study
            attribution is always visible. */}

        {/* <PostHogProvider>{children}</PostHogProvider> */}{/* PostHog disabled */}
        <main className="flex-1">{children}</main>

        {/* Global footer — small attribution + R01 study reference */}
        <footer className="border-t border-gray-200 bg-gray-50 px-6 py-2 text-center text-xs text-gray-500">
          COMPASS — COMmunication of Prostate cAncer Shared deciSions
          {" · "}
          R01 Prostate Cancer Communication Study, Cedars-Sinai Medical Center
        </footer>
      </body>
    </html>
  );
}

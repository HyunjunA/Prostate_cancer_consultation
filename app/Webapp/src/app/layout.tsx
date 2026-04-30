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
        {/* Global brand header — visible on every page */}
        <header className="border-b border-gray-200 bg-white px-6 py-3">
          <h1 className="text-xl font-bold tracking-tight text-gray-900">
            COMPASS
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            <span className="font-semibold">COM</span>munication of{" "}
            <span className="font-semibold">P</span>rostate c
            <span className="font-semibold">A</span>ncer{" "}
            <span className="font-semibold">S</span>hared deci
            <span className="font-semibold">S</span>ions
          </p>
        </header>

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

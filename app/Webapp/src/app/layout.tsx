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
    "COMPASS — COMmunication of Prostate cAncer Shared decisionS. " +
    "Research dashboard for analyzing physician-patient consultation transcripts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `suppressHydrationWarning` on <html> + <body> silences React's mismatch
    // log when browser extensions inject attributes (e.g. `nilread-wkx` from
    // a reading/translation extension) into the root tags before hydration.
    // It only suppresses the diff on these two elements — nested children
    // still warn normally.
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/* COMPASS brand header AND footer are rendered inside `page.tsx`
            so they can react to the dark-mode toggle (the toggle's state
            lives in page.tsx). Layout stays a plain server-component
            shell. */}
        {/* <PostHogProvider>{children}</PostHogProvider> */}{/* PostHog disabled */}
        {children}
      </body>
    </html>
  );
}

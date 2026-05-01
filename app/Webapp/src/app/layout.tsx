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
    <html lang="en">
      <body
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

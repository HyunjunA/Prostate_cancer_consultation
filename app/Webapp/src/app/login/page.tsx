"use client";

import { useState } from "react";

import LoginCard, { type LoginCredentials } from "@/components/LoginCard";

export default function LoginPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(
    undefined,
  );

  // Stub handler — UI-only for now. The real auth wiring (POST to
  // /api/auth/login, store token, redirect) will be added once the
  // password-scheme decision is finalised.
  const handleSubmit = (credentials: LoginCredentials) => {
    setErrorMessage(undefined);
    setIsSubmitting(true);
    // Simulate a round-trip so the loading + error states are demoable.
    setTimeout(() => {
      setIsSubmitting(false);
      if (!credentials.email.includes("@")) {
        setErrorMessage("Please enter a valid email address.");
      }
    }, 800);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <LoginCard
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        errorMessage={errorMessage}
      />
    </main>
  );
}

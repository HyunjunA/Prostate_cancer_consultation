"use client";

import { useState, type FormEvent } from "react";
import { Lock, Mail, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe: boolean;
}

interface LoginCardProps {
  title?: string;
  subtitle?: string;
  errorMessage?: string;
  isSubmitting?: boolean;
  showRememberMe?: boolean;
  showForgotPassword?: boolean;
  onSubmit: (credentials: LoginCredentials) => void;
  onForgotPassword?: () => void;
  className?: string;
}

function LoginCard({
  title = "Sign in",
  subtitle = "Enter your credentials to access the consultation dashboard.",
  errorMessage,
  isSubmitting = false,
  showRememberMe = true,
  showForgotPassword = true,
  onSubmit,
  onForgotPassword,
  className,
}: LoginCardProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;
    onSubmit({ email, password, rememberMe });
  };

  const isDisabled = isSubmitting || email.length === 0 || password.length === 0;

  return (
    <Card className={cn("w-full max-w-md", className)}>
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <label htmlFor="login-email" className="text-sm font-medium">
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                placeholder="you@example.com"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-sm font-medium">
                Password
              </label>
              {showForgotPassword && (
                <button
                  type="button"
                  onClick={onForgotPassword}
                  disabled={isSubmitting}
                  className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                placeholder="••••••••"
                className="pl-9"
              />
            </div>
          </div>

          {showRememberMe && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="login-remember"
                checked={rememberMe}
                onCheckedChange={(v) => setRememberMe(v === true)}
                disabled={isSubmitting}
              />
              <label
                htmlFor="login-remember"
                className="cursor-pointer text-sm text-muted-foreground"
              >
                Remember me on this device
              </label>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
            >
              {errorMessage}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isDisabled}>
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default LoginCard;

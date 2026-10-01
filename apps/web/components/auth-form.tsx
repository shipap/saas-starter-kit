"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { RelayMark } from "./brand";

export function AuthForm({
  register = false,
  returnTo = "/app/overview",
}: {
  register?: boolean;
  returnTo?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(
        `/api/auth/${register ? "sign-up" : "sign-in"}/email`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: form.get("email"),
            password: form.get("password"),
            ...(register ? { name: form.get("name") } : {}),
            callbackURL: returnTo,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.message ||
            data.error?.message ||
            "Sign-in was unsuccessful. Check your details and try again.",
        );
      window.location.assign(returnTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Link href="/" className="wordmark">
        <RelayMark />
        relay.
      </Link>
      <section className="auth-panel">
        <p className="eyebrow">YOUR WORKSPACE</p>
        <h1>{register ? "Create an account" : "Welcome back"}</h1>
        <p className="muted">
          {register
            ? "Start a workspace with your team."
            : "Sign in to continue to your workspace."}
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Name
              <input name="name" autoComplete="name" maxLength={100} required />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              name="password"
              autoComplete={register ? "new-password" : "current-password"}
              minLength={12}
              maxLength={128}
              required
            />
          </label>
          {register && (
            <p className="field-hint">Use at least 12 characters.</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            <ArrowRight size={16} />
          </button>
        </form>
        <p className="auth-alternative">
          {register ? "Already have an account?" : "New here?"}{" "}
          <Link
            href={`${register ? "/sign-in" : "/register"}${returnTo.startsWith("/invite?") ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}
          >
            {register ? "Sign in" : "Create an account"}
          </Link>
        </p>
        <p className="auth-alternative">
          Just exploring? <Link href="/">Try the isolated demo</Link>
        </p>
      </section>
      <small>Powered by the SaaS Starter Kit</small>
    </main>
  );
}

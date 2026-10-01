"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { RelayMark } from "./brand";

export function InviteAcceptance({
  organizationId,
  token,
}: {
  organizationId: string;
  token: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function accept() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invitation.accept",
          organizationId,
          token,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.message || "The invitation could not be accepted.",
        );
      sessionStorage.setItem("relay.organization", organizationId);
      window.location.assign("/app/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Link className="wordmark" href="/">
        <RelayMark />
        relay.
      </Link>
      <section className="auth-panel">
        <ShieldCheck className="muted" />
        <h1>Join your team</h1>
        <p className="muted">
          Sign in with the invited email address, then accept this invitation to
          join the workspace. Invitations expire and can only be used once.
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="invitation-entry-actions">
          <button
            className="button primary"
            onClick={accept}
            disabled={busy || !organizationId || !token}
          >
            {busy ? "Accepting…" : "Accept invitation"}
            <ArrowRight size={16} />
          </button>
          <Link
            className="button"
            href={`/sign-in?returnTo=${encodeURIComponent(`/invite?organizationId=${encodeURIComponent(organizationId)}&token=${encodeURIComponent(token)}`)}`}
          >
            Sign in
          </Link>
        </div>
        {(!organizationId || !token) && (
          <p className="error">
            This invitation link is incomplete. Ask your workspace admin for a
            new invitation.
          </p>
        )}
      </section>
    </main>
  );
}

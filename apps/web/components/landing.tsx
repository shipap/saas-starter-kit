"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Layers3,
  ShieldCheck,
  KeyRound,
  Workflow,
} from "lucide-react";
import { RelayMark } from "./brand";

export function Landing({
  footer,
  publicDemo = false,
}: {
  footer: ReactNode;
  publicDemo?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function enter() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/demo/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error?.message ||
            "The sandbox could not be created. Please try again.",
        );
      window.location.assign("/app/overview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
      setPending(false);
    }
  }
  return (
    <div className="entry-page">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="entry-nav">
        <Link href="/" className="wordmark">
          <RelayMark />
          <span>
            relay<span className="wordmark-dot">.</span>
          </span>
        </Link>
        <div className="entry-nav-right">
          <span className="local-label">
            {publicDemo ? "INTERACTIVE DEMO" : "LOCAL DEMONSTRATION"}
          </span>
          {!publicDemo && (
            <Link className="button quiet" href="/sign-in">
              Sign in <ArrowUpRight size={15} />
            </Link>
          )}
        </div>
      </header>
      <main id="main" className="entry-main">
        <section className="entry-hero">
          <p className="eyebrow">
            <span className="live-dot" /> THE FOUNDATION, ALREADY BUILT
          </p>
          <h1>
            SaaS Starter Kit<span className="hero-period">.</span>
          </h1>
          <p className="hero-description">
            Your product starts where
            <br className="desktop-break" /> the infrastructure is ready.
          </p>
          <p className="hero-copy">
            A working foundation for multi-tenant B2B software. Teams,
            permissions, billing and APIs — connected in one carefully designed
            workspace.
          </p>
          <div className="hero-actions">
            <button
              className="button primary large"
              onClick={enter}
              disabled={pending}
            >
              {pending ? "Preparing your workspace…" : "Try demo"}
              <ArrowRight size={19} />
            </button>
            <a className="button quiet large" href="#architecture">
              Explore architecture <ArrowUpRight size={17} />
            </a>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="hero-note">
            <Check size={14} /> No account. No real payments. Your own isolated
            sandbox.{" "}
            {publicDemo && "Demo data resets automatically after six hours."}
          </p>
        </section>
        <section
          className="entry-capabilities"
          aria-label="Included capabilities"
        >
          <div className="capability">
            <Layers3 />
            <div>
              <h2>Separate workspaces</h2>
              <p>Tenant isolation and team invitations.</p>
            </div>
            <span>01</span>
          </div>
          <div className="capability">
            <ShieldCheck />
            <div>
              <h2>Permissions that hold</h2>
              <p>Four roles. Authorization on the server.</p>
            </div>
            <span>02</span>
          </div>
          <div className="capability">
            <Workflow />
            <div>
              <h2>Ready for the business</h2>
              <p>Plans, billing states and an audit trail.</p>
            </div>
            <span>03</span>
          </div>
          <div className="capability">
            <KeyRound />
            <div>
              <h2>A real integration surface</h2>
              <p>Scoped API keys and recorded usage.</p>
            </div>
            <span>04</span>
          </div>
        </section>
        <section id="architecture" className="entry-architecture">
          <div>
            <p className="eyebrow">BUILT TO EXTEND</p>
            <h2>
              The reusable work.
              <br />
              Before your business logic.
            </h2>
            <p>
              Relay is a fictional product demonstrating this starter. Explore
              the same workspace as an owner, admin, member or viewer, and see
              how access changes.
            </p>
          </div>
          <dl>
            <div>
              <dt>Product interface</dt>
              <dd>Next.js · TypeScript · accessible components</dd>
            </div>
            <div>
              <dt>Application layer</dt>
              <dd>Sessions · tenant-scoped services · centralized roles</dd>
            </div>
            <div>
              <dt>Data & integrations</dt>
              <dd>PostgreSQL · Drizzle · billing & email providers</dd>
            </div>
            <div>
              <dt>Local sandbox</dt>
              <dd>PGlite · development outbox · mock billing</dd>
            </div>
          </dl>
        </section>
      </main>
      {footer}
    </div>
  );
}

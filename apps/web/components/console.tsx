"use client";

import Link from "next/link";
import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  ChevronDown,
  Copy,
  CreditCard,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  SunMoon,
  Users,
  X,
} from "lucide-react";
import type { AppState, PlatformState, Role, Theme } from "@kit/shared/types";
import { RelayMark } from "./brand";

const navigation = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "team", label: "Team", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "keys", label: "API Keys", icon: KeyRound },
  { id: "audit", label: "Audit Log", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings2 },
];
const roles: Role[] = ["OWNER", "ADMIN", "MEMBER", "VIEWER"];
const titleCase = (text: string) =>
  text
    .toLowerCase()
    .replace(
      /(^|[._ -])(\w)/g,
      (_, prefix: string, letter: string) =>
        `${prefix === "." || prefix === "_" ? " " : prefix}${letter.toUpperCase()}`,
    );
const initials = (name: string) =>
  name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
const date = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
const time = (value: string) =>
  new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
const eventName = (event: string) => titleCase(event.replace(/\./g, " "));
type ActionData = Record<string, unknown>;
type DialogState = { kind: string; data?: Record<string, string> } | null;

function GridTable({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className: string;
  label: string;
}) {
  return (
    <div className={className} role="table" aria-label={label}>
      {children}
    </div>
  );
}

function GridRow({
  children,
  className,
  header = false,
}: {
  children: ReactNode;
  className: string;
  header?: boolean;
}) {
  return (
    <div className={className} role="row">
      {Children.map(children, (child) => (
        <div className="grid-cell" role={header ? "columnheader" : "cell"}>
          {child}
        </div>
      ))}
    </div>
  );
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(
      new Error(
        data.error?.message ||
          data.message ||
          "The request could not be completed.",
      ),
      { status: response.status },
    );
  return data;
}

function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      <span />
      {titleCase(value)}
    </span>
  );
}

function Dialog({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    const previousFocus = document.activeElement;
    node?.showModal();
    return () => {
      node?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);
  return (
    <dialog
      className="dialog"
      ref={ref}
      onCancel={onClose}
      aria-labelledby="dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-head">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Console({ view, footer }: { view: string; footer: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogError, setDialogError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [theme, setTheme] = useState<Theme>("system");
  const [themeReady, setThemeReady] = useState(false);
  const [platform, setPlatform] = useState<PlatformState | null>(null);
  const [newKey, setNewKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [onboarding, setOnboarding] = useState(false);
  const [authMessages, setAuthMessages] = useState<
    { id: string; to: string; subject: string; text: string }[]
  >([]);
  const current = navigation.find((x) => x.id === view);
  const title =
    current?.label ||
    (view === "platform" ? "Platform Admin Demo" : "Overview");

  const load = useCallback(async (organizationId?: string) => {
    const selected =
      organizationId || sessionStorage.getItem("relay.organization") || "";
    try {
      const data = await request<AppState>(
        `/api/bootstrap${selected ? `?organizationId=${encodeURIComponent(selected)}` : ""}`,
      );
      setState(data);
      setError("");
      if (data.organization?.id)
        sessionStorage.setItem("relay.organization", data.organization.id);
      return data;
    } catch (e) {
      if (selected) {
        sessionStorage.removeItem("relay.organization");
        const data = await request<AppState>("/api/bootstrap");
        setState(data);
        setError("");
        return data;
      }
      throw e;
    }
  }, []);

  useEffect(() => {
    load().catch((e: Error & { status?: number }) => {
      if (e.status === 401) window.location.assign("/");
      else if (e.status === 404) setOnboarding(true);
      else setError(e.message);
    });
    const saved = localStorage.getItem("relay.theme");
    if (saved === "light" || saved === "dark" || saved === "system")
      setTheme(saved);
    setThemeReady(true);
  }, [load]);

  useEffect(() => {
    if (!themeReady) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.setAttribute(
        "data-theme",
        theme === "system" ? (media.matches ? "dark" : "light") : theme,
      );
    apply();
    localStorage.setItem("relay.theme", theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, themeReady]);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setDialog({ kind: "command" });
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    setQuery("");
    setFilter("ALL");
    setDrawer(false);
  }, [view]);
  useEffect(() => {
    if (!drawer) return;
    const previousFocus = document.activeElement;
    const navigationPanel = document.getElementById("workspace-navigation");
    const getControls = () =>
      Array.from(
        navigationPanel?.querySelectorAll<HTMLElement>(
          "a[href],button:not(:disabled),select:not(:disabled)",
        ) || [],
      ).filter((control) => control.getClientRects().length > 0);
    getControls()[1]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawer(false);
      }
      if (event.key !== "Tab") return;
      const controls = getControls();
      if (event.shiftKey && document.activeElement === controls[0]) {
        event.preventDefault();
        controls.at(-1)?.focus();
      }
      if (!event.shiftKey && document.activeElement === controls.at(-1)) {
        event.preventDefault();
        controls[0]?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, [drawer]);
  useEffect(() => {
    if (view === "platform" && state)
      request<PlatformState>("/api/platform")
        .then(setPlatform)
        .catch((e: Error) => setError(e.message));
  }, [view, state]);

  const can = (permission: string) =>
    state?.permissions.includes(permission) || false;
  const open = (kind: string, data?: Record<string, string>) => {
    setDialogError("");
    setNewKey("");
    setCopied(false);
    setDialog({ kind, data });
  };
  async function act(
    action: string,
    fields: ActionData = {},
    success = "Changes saved.",
  ) {
    setBusy(true);
    setDialogError("");
    setError("");
    try {
      const result = await request<{ ok: boolean; key?: string }>(
        "/api/actions",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            organizationId: state?.organization?.id,
            ...fields,
          }),
        },
      );
      if (action === "session.logout") {
        sessionStorage.removeItem("relay.organization");
        window.location.assign("/");
        return result;
      }
      if (
        action === "demo.reset" ||
        action === "organization.delete" ||
        action === "organization.leave"
      )
        sessionStorage.removeItem("relay.organization");
      await load();
      setNotice(success);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Please try again.";
      setDialogError(message);
      if (!dialog) setError(message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const kind = dialog?.kind;
    let result;
    if (kind === "project")
      result = await act(
        dialog?.data?.id ? "project.update" : "project.create",
        { ...values, ...(dialog?.data?.id ? { id: dialog.data.id } : {}) },
        "Project saved.",
      );
    if (kind === "invite")
      result = await act(
        "invitation.create",
        values,
        "Invitation added to the development outbox.",
      );
    if (kind === "organization")
      result = await act("organization.create", values, "Workspace created.");
    if (kind === "key") {
      result = await act(
        "key.create",
        { name: values.name, scopes: ["projects:read"] },
        "API key created.",
      );
      if (result?.key) {
        setNewKey(result.key);
        return;
      }
    }
    if (kind === "delete")
      result = await act("organization.delete", values, "Workspace deleted.");
    if (result) setDialog(null);
  }

  if (!state && onboarding)
    return (
      <main className="auth-page">
        <Link href="/" className="wordmark">
          <RelayMark />
          relay.
        </Link>
        <section className="auth-panel">
          <p className="eyebrow">A PLACE FOR YOUR TEAM</p>
          <h1>Create your workspace</h1>
          <p className="muted">
            Your account is ready. Create an organization to start working.
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await request("/api/actions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "organization.create",
                    ...Object.fromEntries(new FormData(e.currentTarget)),
                  }),
                });
                sessionStorage.removeItem("relay.organization");
                await load();
                setOnboarding(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Please try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Workspace name
              <input name="name" required maxLength={100} />
            </label>
            <label>
              Slug
              <input
                name="slug"
                required
                maxLength={60}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              />
              <span className="field-hint">
                Lowercase letters, numbers and hyphens.
              </span>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={busy}>
              {busy ? "Creating…" : "Create workspace"}
              <ArrowRight size={16} />
            </button>
          </form>
          <button
            className="text-link"
            onClick={async () => {
              try {
                const result = await request<
                  | {
                      messages?: typeof authMessages;
                      emails?: typeof authMessages;
                    }
                  | typeof authMessages
                >("/api/development/outbox");
                setAuthMessages(
                  Array.isArray(result)
                    ? result
                    : result.messages || result.emails || [],
                );
              } catch (e) {
                setError(
                  e instanceof Error
                    ? e.message
                    : "The development outbox is unavailable.",
                );
              }
            }}
          >
            Open local verification outbox
          </button>
          {authMessages.map((message) => (
            <article className="verification-message" key={message.id}>
              <h2>{message.subject}</h2>
              <pre>{message.text}</pre>
              {message.text.match(/https?:\/\/[^\s]+/)?.[0] && (
                <a
                  className="button"
                  href={message.text.match(/https?:\/\/[^\s]+/)?.[0]}
                >
                  Verify email <ArrowUpRight size={16} />
                </a>
              )}
            </article>
          ))}
        </section>
      </main>
    );
  if (!state)
    return (
      <main className="startup">
        <RelayMark />
        <h1>
          {error ? "Unable to open your workspace" : "Opening your workspace"}
        </h1>
        <p role={error ? "alert" : "status"}>
          {error || "Loading your projects, team and activity…"}
        </p>
        {error && (
          <Link className="button primary" href="/">
            Return to demo entry
          </Link>
        )}
      </main>
    );
  const role = state.organization?.role || "OWNER";
  const projects = state.projects.filter(
    (x) =>
      `${x.name} ${x.description}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter === "ALL" || x.status === filter),
  );
  const members = state.members.filter((x) =>
    `${x.name} ${x.email} ${x.role}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const audit = state.audit.filter((x) =>
    `${x.actor} ${x.event} ${x.target}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const active = state.projects.filter((x) => x.status === "ACTIVE").length;
  const maxUsage = Math.max(1, ...state.usage.daily.map((x) => x.count));

  const projectTable = (rows: AppState["projects"], compact = false) => (
    <GridTable className="data-table project-table" label="Projects">
      <GridRow className="table-header" header>
        <span>Project</span>
        <span>Status</span>
        <span>Lead</span>
        <span>{compact ? "Created" : "Actions"}</span>
      </GridRow>
      {rows.length ? (
        rows.map((project) => (
          <GridRow className="table-row" key={project.id}>
            <div className="project-identity">
              <span className="project-icon">
                <FolderKanban size={17} />
              </span>
              <div>
                <strong>{project.name}</strong>
                <p>{project.description}</p>
              </div>
            </div>
            <Status value={project.status} />
            <span className="person">
              <span className="avatar small">
                {initials(project.ownerName)}
              </span>
              {project.ownerName}
            </span>
            {compact ? (
              <span className="mono muted">{date(project.createdAt)}</span>
            ) : (
              <div className="row-actions">
                <button
                  className="button small quiet"
                  disabled={!can("project.write") || busy}
                  title={
                    !can("project.write")
                      ? "Viewer access is read-only."
                      : "Edit project"
                  }
                  onClick={() =>
                    open("project", {
                      id: project.id,
                      name: project.name,
                      description: project.description,
                      status: project.status,
                    })
                  }
                >
                  Edit
                </button>
                {project.status !== "ARCHIVED" && (
                  <button
                    className="icon-button"
                    disabled={!can("project.write") || busy}
                    aria-label={`Archive ${project.name}`}
                    onClick={() =>
                      open("archive", {
                        id: project.id,
                        name: project.name,
                        description: project.description,
                      })
                    }
                  >
                    <ArrowDownLeft size={17} />
                  </button>
                )}
              </div>
            )}
          </GridRow>
        ))
      ) : (
        <div className="empty">
          <FolderKanban />
          <h3>No projects found</h3>
          <p>Try a different search or create your first project.</p>
        </div>
      )}
    </GridTable>
  );

  return (
    <div className="console-shell">
      <a className="skip-link" href="#workspace-main">
        Skip to main content
      </a>
      <aside
        id="workspace-navigation"
        role={drawer ? "dialog" : undefined}
        aria-modal={drawer ? true : undefined}
        className={`sidebar ${drawer ? "is-open" : ""}`}
        aria-label="Workspace navigation"
      >
        <Link className="wordmark sidebar-brand" href="/">
          <RelayMark />
          relay<span className="wordmark-dot">.</span>
        </Link>
        <button
          className="icon-button mobile-close"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-select">
          <span className="workspace-monogram">
            {initials(state.organization?.name || "Workspace")}
          </span>
          <label className="sr-only" htmlFor="workspace">
            Current workspace
          </label>
          <select
            id="workspace"
            value={state.organization?.id || ""}
            onChange={(e) => {
              load(e.target.value).catch((err: Error) => setError(err.message));
            }}
            aria-label="Switch workspace"
          >
            {state.organizations.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </div>
        <button className="sidebar-command" onClick={() => open("command")}>
          <Search size={16} />
          <span>Quick navigation</span>
          <kbd>⌘ K</kbd>
        </button>
        <p className="nav-section-label">WORKSPACE</p>
        <nav>
          {navigation.map(({ id, label, icon: Icon }) => (
            <Link
              href={`/app/${id}`}
              key={id}
              className={`nav-link ${view === id ? "selected" : ""}`}
              aria-current={view === id ? "page" : undefined}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "projects" && <small>{state.projects.length}</small>}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {state.demo && (
            <>
              <p className="nav-section-label">DEVELOPMENT</p>
              <button className="nav-link" onClick={() => open("outbox")}>
                <Mail size={18} />
                <span>Dev outbox</span>
                <small>{state.outbox.length}</small>
              </button>
              <Link
                href="/app/platform"
                className={`nav-link ${view === "platform" ? "selected" : ""}`}
              >
                <ShieldCheck size={18} />
                <span>Platform admin</span>
                <ArrowUpRight size={14} />
              </Link>
            </>
          )}
          <div className="sidebar-powered">Powered by the SaaS Starter Kit</div>
          <button
            className="user-panel"
            onClick={() => window.location.assign("/app/settings")}
          >
            <span className="avatar">{initials(state.user.name)}</span>
            <span>
              <strong>{state.user.name}</strong>
              <small>{titleCase(role)} access</small>
            </span>
            <MoreHorizontal size={18} />
          </button>
        </div>
      </aside>
      {drawer && (
        <button
          className="drawer-scrim"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <div className="workspace-body" inert={drawer}>
        <header className="workspace-topbar">
          <div className="breadcrumb">
            <button
              className="icon-button menu-button"
              aria-label="Open navigation"
              aria-expanded={drawer}
              aria-controls="workspace-navigation"
              onClick={() => setDrawer(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb-org">
              {state.organization?.name || "New workspace"}
            </span>
            <span className="breadcrumb-divider">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-tools">
            {state.demo && <span className="demo-tag">DEMO SANDBOX</span>}
            <button
              className="icon-button"
              aria-label="Change theme"
              title={`Theme: ${theme}`}
              onClick={() =>
                setTheme(
                  theme === "light"
                    ? "dark"
                    : theme === "dark"
                      ? "system"
                      : "light",
                )
              }
            >
              <SunMoon size={18} />
            </button>
            {can("outbox.read") && (
              <button
                className="icon-button"
                aria-label="Open development outbox"
                onClick={() => open("outbox")}
              >
                <Bell size={18} />
                {state.outbox.length > 0 && (
                  <span className="notification-dot" />
                )}
              </button>
            )}
          </div>
        </header>
        {state.demo && (
          <div className="demo-controls">
            <div>
              <span className="live-dot" />
              <strong>Demo controls</strong>
              <span className="demo-explanation">
                Fictional data. Real permissions.
              </span>
            </div>
            <div className="demo-control-actions">
              <label htmlFor="role">View as</label>
              <select
                id="role"
                aria-label="Demo role"
                value={role}
                disabled={busy}
                onChange={(e) =>
                  act(
                    "demo.role",
                    { role: e.target.value },
                    `Now viewing as ${titleCase(e.target.value)}.`,
                  )
                }
              >
                {roles.map((x) => (
                  <option key={x} value={x}>
                    {titleCase(x)}
                  </option>
                ))}
              </select>
              <button
                className="button small quiet"
                onClick={() => open("reset")}
                disabled={busy}
              >
                <RotateCcw size={14} />
                <span>Reset sandbox</span>
              </button>
            </div>
          </div>
        )}
        <main id="workspace-main" className="workspace-main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {view === "overview"
                  ? "WORKSPACE AT A GLANCE"
                  : view === "platform"
                    ? "LOCAL PREVIEW · CURRENT SANDBOX ONLY"
                    : "WORKSPACE / " + title.toUpperCase()}
              </p>
              <h1>
                {view === "overview"
                  ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${state.user.name.split(" ")[0]}`
                  : title}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {view === "overview"
                  ? "Your team, projects and integration activity in one place."
                  : view === "projects"
                    ? "Small workstreams. Clear ownership. A shared view of progress."
                    : view === "team"
                      ? "Manage access to your workspace and invite your next teammate."
                      : view === "billing"
                        ? "A clear view of your plan, subscription and next steps."
                        : view === "keys"
                          ? "Connect your tools with scoped, revocable workspace credentials."
                          : view === "audit"
                            ? "A record of important changes across this workspace."
                            : view === "settings"
                              ? "Your profile, preferences and workspace configuration."
                              : "A safe operational overview of this isolated demo sandbox."}
              </p>
            </div>
            {(view === "overview" || view === "projects") && (
              <button
                className="button primary"
                disabled={!can("project.write") || busy}
                title={
                  !can("project.write")
                    ? "Viewer access is read-only."
                    : undefined
                }
                onClick={() => open("project")}
              >
                <Plus size={17} />
                New project
              </button>
            )}
            {view === "team" && (
              <button
                className="button primary"
                disabled={!can("team.manage") || busy}
                title={
                  !can("team.manage")
                    ? "Owner or admin access required."
                    : undefined
                }
                onClick={() => open("invite")}
              >
                <Plus size={17} />
                Invite member
              </button>
            )}
            {view === "keys" && (
              <button
                className="button primary"
                disabled={!can("keys.manage") || busy}
                title={
                  !can("keys.manage")
                    ? "Owner or admin access required."
                    : undefined
                }
                onClick={() => open("key")}
              >
                <Plus size={17} />
                Create API key
              </button>
            )}
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={17} />
              </button>
            </div>
          )}
          {!state.organization?.id && (
            <section className="panel empty">
              <LayersFallback />
              <h2>Create your first workspace</h2>
              <p>
                Organizations keep projects, team access and billing together.
              </p>
              <button
                className="button primary"
                onClick={() => open("organization")}
              >
                <Plus size={17} />
                Create workspace
              </button>
            </section>
          )}
          {view === "overview" && (
            <>
              <section className="metric-strip" aria-label="Workspace metrics">
                <div>
                  <span>Projects</span>
                  <strong>
                    {state.projects.length}
                    <small>{active} active</small>
                  </strong>
                  <FolderKanban />
                </div>
                <div>
                  <span>Team members</span>
                  <strong>
                    {state.members.length}
                    <small>
                      {
                        state.invitations.filter((x) => x.status === "PENDING")
                          .length
                      }{" "}
                      pending invites
                    </small>
                  </strong>
                  <Users />
                </div>
                <div>
                  <span>API requests this month</span>
                  <strong>
                    {state.usage.monthRequests.toLocaleString()}
                    <small>Recorded usage</small>
                  </strong>
                  <Activity />
                </div>
                <div>
                  <span>Current plan</span>
                  <strong>
                    {titleCase(state.billing.plan)}
                    <small>
                      {state.billing.cancelAtPeriodEnd
                        ? "Cancels at period end"
                        : titleCase(state.billing.status)}
                    </small>
                  </strong>
                  <CreditCard />
                </div>
              </section>
              <div className="overview-grid">
                <section className="panel usage-panel">
                  <div className="section-heading">
                    <div>
                      <h2>API activity</h2>
                      <p>Daily requests recorded by this workspace</p>
                    </div>
                    <span className="period-label">
                      LAST {state.usage.daily.length} DAYS
                    </span>
                  </div>
                  <div
                    className="usage-chart"
                    role="img"
                    aria-label={state.usage.daily
                      .map((x) => `${x.date}: ${x.count} requests`)
                      .join("; ")}
                  >
                    <div className="chart-grid">
                      <span>{maxUsage}</span>
                      <span>{Math.round(maxUsage / 2)}</span>
                      <span>0</span>
                    </div>
                    <div className="bars">
                      {state.usage.daily.map((day, i) => (
                        <div className="chart-column" key={day.date}>
                          <span className="chart-count">{day.count}</span>
                          <div
                            className="bar"
                            style={{
                              height: `${Math.max(2, (day.count / maxUsage) * 100)}%`,
                            }}
                            title={`${day.date}: ${day.count} requests`}
                          />
                          <span className="chart-date">
                            {i %
                              Math.max(
                                1,
                                Math.floor(state.usage.daily.length / 5),
                              ) ===
                            0
                              ? date(day.date)
                              : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="chart-footnote">
                    <span className="legend-dot" /> API requests{" "}
                    <span>
                      {state.demo
                        ? "Seeded activity + your API calls"
                        : "Workspace API calls"}
                    </span>
                  </div>
                </section>
                <section className="panel activity-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Recent activity</h2>
                      <p>Changes made in your workspace</p>
                    </div>
                    <Link href="/app/audit" className="text-link">
                      View all <ArrowUpRight size={14} />
                    </Link>
                  </div>
                  <div className="activity-list">
                    {state.audit.slice(0, 5).map((event) => (
                      <div className="activity-item" key={event.id}>
                        <span className="activity-symbol">
                          <Activity size={14} />
                        </span>
                        <div>
                          <strong>{eventName(event.event)}</strong>
                          <p>
                            {event.actor} <span>·</span> {event.target}
                          </p>
                        </div>
                        <time dateTime={event.createdAt}>
                          {date(event.createdAt)}
                        </time>
                      </div>
                    ))}
                    {state.audit.length === 0 && (
                      <p className="muted">
                        Your workspace activity will appear here.
                      </p>
                    )}
                  </div>
                </section>
              </div>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Projects in motion</h2>
                    <p>The work your team is building</p>
                  </div>
                  <Link className="text-link" href="/app/projects">
                    All projects <ArrowRight size={15} />
                  </Link>
                </div>
                {projectTable(state.projects.slice(0, 4), true)}
              </section>
            </>
          )}
          {view === "projects" && (
            <section className="panel">
              <div className="table-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <label className="sr-only" htmlFor="project-search">
                    Search projects
                  </label>
                  <input
                    id="project-search"
                    placeholder="Search projects…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <label className="filter-field">
                  Status
                  <select
                    aria-label="Filter project status"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="ALL">All statuses</option>
                    <option value="ACTIVE">Active</option>
                    <option value="PAUSED">Paused</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </label>
              </div>
              {projectTable(projects)}
              <div className="table-footer">
                {projects.length} of {state.projects.length} projects
                <span>
                  {can("project.write")
                    ? "Project editing enabled"
                    : "Read-only access"}
                </span>
              </div>
            </section>
          )}
          {view === "team" && (
            <>
              <section className="panel">
                <div className="table-toolbar">
                  <div className="search-field">
                    <Search size={17} />
                    <label className="sr-only" htmlFor="team-search">
                      Search team
                    </label>
                    <input
                      id="team-search"
                      placeholder="Search by name, email or role…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </div>
                  <span className="muted">{state.members.length} members</span>
                </div>
                <GridTable
                  className="data-table team-table"
                  label="Team members"
                >
                  <GridRow className="table-header" header>
                    <span>Team member</span>
                    <span>Role</span>
                    <span>Access</span>
                    <span>Actions</span>
                  </GridRow>
                  {members.map((member) => (
                    <GridRow className="table-row" key={member.id}>
                      <div className="person">
                        <span
                          className={`avatar avatar-${member.role.toLowerCase()}`}
                        >
                          {initials(member.name)}
                        </span>
                        <div>
                          <strong>
                            {member.name}
                            {member.userId === state.user.id && (
                              <span className="you-label">You</span>
                            )}
                          </strong>
                          <p>{member.email}</p>
                        </div>
                      </div>
                      <label>
                        <span className="sr-only">Role for {member.name}</span>
                        <select
                          value={member.role}
                          disabled={
                            !can("team.manage") ||
                            member.role === "OWNER" ||
                            busy
                          }
                          onChange={(e) =>
                            open("role", {
                              id: member.id,
                              name: member.name,
                              role: e.target.value,
                            })
                          }
                        >
                          {roles
                            .filter(
                              (x) => x !== "OWNER" || member.role === "OWNER",
                            )
                            .map((x) => (
                              <option key={x} value={x}>
                                {titleCase(x)}
                              </option>
                            ))}
                        </select>
                      </label>
                      <span className="access-indicator">
                        <span />
                        Active
                      </span>
                      <button
                        className="button small quiet danger-text"
                        disabled={
                          !can("team.manage") || member.role === "OWNER" || busy
                        }
                        title={
                          member.role === "OWNER"
                            ? "The owner is protected from removal."
                            : undefined
                        }
                        onClick={() =>
                          open("remove", { id: member.id, name: member.name })
                        }
                      >
                        Remove
                      </button>
                    </GridRow>
                  ))}
                  {members.length === 0 && (
                    <div className="empty">
                      <Users />
                      <h3>No matching teammates</h3>
                      <p>Search by name, email or role.</p>
                    </div>
                  )}
                </GridTable>
              </section>
              {state.invitations.length > 0 && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Invitations</h2>
                      <p>
                        Invites expire automatically and can only be used once.
                      </p>
                    </div>
                    <button
                      className="text-link"
                      disabled={!can("outbox.read")}
                      onClick={() => open("outbox")}
                    >
                      Open dev outbox <ArrowUpRight size={14} />
                    </button>
                  </div>
                  <div className="invitation-list">
                    {state.invitations.map((invite) => (
                      <div key={invite.id}>
                        <Mail size={18} />
                        <span>
                          <strong>{invite.email}</strong>
                          <small>
                            {titleCase(invite.role)} · Expires{" "}
                            {date(invite.expiresAt)}
                          </small>
                        </span>
                        <Status value={invite.status} />
                        {invite.status === "PENDING" && (
                          <button
                            className="button small quiet"
                            disabled={!can("team.manage") || busy}
                            onClick={() =>
                              open("revoke-invite", {
                                id: invite.id,
                                name: invite.email,
                              })
                            }
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {view === "billing" && (
            <>
              <section className="panel current-plan">
                <div>
                  <p className="eyebrow">CURRENT SUBSCRIPTION</p>
                  <h2>
                    {titleCase(state.billing.plan)}{" "}
                    <Status value={state.billing.status} />
                  </h2>
                  <p>
                    {state.billing.cancelAtPeriodEnd
                      ? `Cancellation scheduled for ${date(state.billing.currentPeriodEnd)}.`
                      : `Current period ends ${date(state.billing.currentPeriodEnd)}.`}
                  </p>
                  {state.demo && (
                    <p className="billing-disclaimer">
                      Demo billing. No payment method, charge or external
                      provider.
                    </p>
                  )}
                </div>
                <div className="current-plan-actions">
                  {state.billing.cancelAtPeriodEnd ||
                  state.billing.status === "CANCELED" ? (
                    <button
                      className="button"
                      disabled={!can("billing.manage") || busy}
                      onClick={() =>
                        act(
                          "billing.reactivate",
                          {},
                          "Subscription reactivated.",
                        )
                      }
                    >
                      Reactivate subscription
                    </button>
                  ) : (
                    <button
                      className="button"
                      disabled={!can("billing.manage") || busy}
                      onClick={() => open("cancel")}
                    >
                      Cancel subscription
                    </button>
                  )}
                  <span className="field-hint">
                    {can("billing.manage")
                      ? "Changes are recorded in the audit log."
                      : "Only the workspace owner can manage billing."}
                  </span>
                </div>
              </section>
              <div className="plan-grid">
                {[
                  {
                    id: "FREE",
                    price: "0",
                    description: "A place to start",
                    features: [
                      "Shared workspace",
                      "Role-based access",
                      "Core project tools",
                    ],
                  },
                  {
                    id: "PRO",
                    price: "29",
                    description: "For an active team",
                    features: [
                      "Team invitations",
                      "Workspace API keys",
                      "Usage & audit history",
                    ],
                  },
                  {
                    id: "BUSINESS",
                    price: "99",
                    description: "For connected operations",
                    features: [
                      "Advanced integrations",
                      "Higher usage allowance",
                      "Custom provider support",
                    ],
                  },
                ].map((plan) => (
                  <section
                    className={`plan ${state.billing.plan === plan.id ? "current" : ""}`}
                    key={plan.id}
                  >
                    <div className="plan-label">
                      <h2>{titleCase(plan.id)}</h2>
                      {state.billing.plan === plan.id && <span>YOUR PLAN</span>}
                    </div>
                    <p>{plan.description}</p>
                    <div className="price">
                      ${plan.price}
                      <small>/ month</small>
                    </div>
                    <p className="field-hint">Illustrative demo pricing</p>
                    <ul>
                      {plan.features.map((x) => (
                        <li key={x}>
                          <Check size={15} />
                          {x}
                        </li>
                      ))}
                    </ul>
                    <button
                      className={`button ${state.billing.plan === plan.id ? "" : "primary"}`}
                      disabled={
                        !can("billing.manage") ||
                        state.billing.plan === plan.id ||
                        busy
                      }
                      onClick={() => open("plan", { plan: plan.id })}
                    >
                      {state.billing.plan === plan.id
                        ? "Current plan"
                        : `Switch to ${titleCase(plan.id)}`}
                    </button>
                  </section>
                ))}
              </div>
              <div className="billing-note">
                <ShieldCheck size={18} />
                <p>
                  All plans share the same core demo features. Prices illustrate
                  the billing adapter; usage limits are not enforced as
                  commercial entitlements.
                </p>
              </div>
              {state.demo && (
                <section className="panel simulation">
                  <div>
                    <h2>Billing state simulator</h2>
                    <p>
                      Review how subscription states appear without a payment
                      provider.
                    </p>
                  </div>
                  <label>
                    Subscription status
                    <select
                      value={state.billing.status}
                      disabled={!can("billing.manage") || busy}
                      onChange={(e) =>
                        act(
                          "billing.simulate",
                          { status: e.target.value },
                          "Billing state updated.",
                        )
                      }
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="PAST_DUE">Past due</option>
                      <option value="CANCELED">Canceled</option>
                    </select>
                  </label>
                </section>
              )}
            </>
          )}
          {view === "keys" && (
            <>
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Workspace credentials</h2>
                    <p>
                      Secrets are shown once. Only irreversible hashes are
                      stored.
                    </p>
                  </div>
                  <KeyRound size={20} />
                </div>
                {can("keys.read") ? (
                  <div className="key-list">
                    {state.apiKeys.map((key) => (
                      <div className="key-row" key={key.id}>
                        <span className="key-icon">
                          <KeyRound size={19} />
                        </span>
                        <div>
                          <strong>{key.name}</strong>
                          <p className="mono">
                            {key.prefix}••••{key.lastFour}
                          </p>
                        </div>
                        <div>
                          <span className="scope-tag">
                            {key.scopes.join(", ")}
                          </span>
                          <small>
                            Last used{" "}
                            {key.lastUsedAt ? time(key.lastUsedAt) : "Never"}
                          </small>
                        </div>
                        <Status value={key.revokedAt ? "REVOKED" : "ACTIVE"} />
                        <button
                          className="button quiet small danger-text"
                          disabled={
                            !!key.revokedAt || !can("keys.manage") || busy
                          }
                          onClick={() =>
                            open("revoke-key", { id: key.id, name: key.name })
                          }
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                    {state.apiKeys.length === 0 && (
                      <div className="empty">
                        <KeyRound />
                        <h3>No API keys yet</h3>
                        <p>
                          Create a key to connect your tools to this workspace.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty">
                    <ShieldCheck />
                    <h3>Credentials are restricted</h3>
                    <p>
                      Workspace owners and admins can view and manage API keys.
                    </p>
                  </div>
                )}
              </section>
              <section className="panel api-example">
                <div>
                  <p className="eyebrow">INTEGRATION EXAMPLE</p>
                  <h2>List your workspace projects</h2>
                  <p>
                    Keys are scoped to their workspace. Every successful request
                    updates usage.
                  </p>
                </div>
                <pre>
                  <code>{`curl ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/v1/projects \\\n  -H "Authorization: Bearer YOUR_API_KEY"`}</code>
                </pre>
                <p className="field-hint">
                  Replace YOUR_API_KEY with the one-time secret from a newly
                  created key.
                </p>
              </section>
              {state.usage.recent.length > 0 && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Recent API requests</h2>
                      <p>Only request metadata is recorded.</p>
                    </div>
                  </div>
                  <div className="request-list">
                    {state.usage.recent.slice(0, 8).map((item) => (
                      <div key={item.id}>
                        <code>{item.path}</code>
                        <span className="status status-active">
                          {item.status}
                        </span>
                        <time>{time(item.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
          {view === "audit" && (
            <section className="panel">
              <div className="table-toolbar">
                <div className="search-field">
                  <Search size={17} />
                  <label className="sr-only" htmlFor="audit-search">
                    Search audit log
                  </label>
                  <input
                    id="audit-search"
                    placeholder="Search events, people or targets…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
                <span className="muted">
                  {audit.length} events · read-only history
                </span>
              </div>
              <GridTable
                className="data-table audit-table"
                label="Audit events"
              >
                <GridRow className="table-header" header>
                  <span>Event</span>
                  <span>Actor</span>
                  <span>Target</span>
                  <span>Time</span>
                </GridRow>
                {audit.map((event) => (
                  <GridRow className="table-row" key={event.id}>
                    <strong className="event-cell">
                      <span className="activity-symbol">
                        <Activity size={14} />
                      </span>
                      {eventName(event.event)}
                    </strong>
                    <span>{event.actor}</span>
                    <span className="audit-target">{event.target}</span>
                    <time className="mono">{time(event.createdAt)}</time>
                  </GridRow>
                ))}
                {audit.length === 0 && (
                  <div className="empty">
                    <Activity />
                    <h3>No matching events</h3>
                    <p>
                      Try another search. New workspace actions appear here
                      automatically.
                    </p>
                  </div>
                )}
              </GridTable>
              <div className="table-footer">
                Audit events cannot be edited or removed through the
                application.
              </div>
            </section>
          )}
          {view === "settings" && (
            <div className="settings-stack">
              <section className="panel settings-panel">
                <div className="settings-description">
                  <h2>Your profile</h2>
                  <p>Your identity within this workspace.</p>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const values = new FormData(e.currentTarget);
                    await act(
                      "account.update",
                      { name: values.get("name"), theme },
                      "Profile updated.",
                    );
                  }}
                >
                  <label>
                    Full name
                    <input
                      name="name"
                      defaultValue={state.user.name}
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Email
                    <input value={state.user.email} type="email" readOnly />
                    <span className="field-hint">
                      Email changes require a verified authentication flow.
                    </span>
                  </label>
                  <button className="button primary" disabled={busy}>
                    Save profile
                  </button>
                </form>
              </section>
              <section className="panel settings-panel">
                <div className="settings-description">
                  <h2>Appearance</h2>
                  <p>Choose how Relay looks on this device.</p>
                </div>
                <div className="theme-control">
                  {(["light", "dark", "system"] as Theme[]).map((x) => (
                    <button
                      key={x}
                      className={`theme-choice ${theme === x ? "selected" : ""}`}
                      aria-pressed={theme === x}
                      onClick={() => {
                        setTheme(x);
                        act(
                          "account.update",
                          { name: state.user.name, theme: x },
                          "Appearance updated.",
                        );
                      }}
                    >
                      <span className={`theme-preview preview-${x}`}>
                        <i />
                        <i />
                        <i />
                      </span>
                      <SunMoon size={15} />
                      {titleCase(x)}
                      {theme === x && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="settings-description">
                  <h2>Workspace details</h2>
                  <p>Manage your organization&apos;s name and identifier.</p>
                  <button
                    className="text-link"
                    onClick={() => open("organization")}
                  >
                    <Plus size={14} /> Create another workspace
                  </button>
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await act(
                      "organization.update",
                      Object.fromEntries(new FormData(e.currentTarget)),
                      "Workspace updated.",
                    );
                  }}
                >
                  <label>
                    Workspace name
                    <input
                      name="name"
                      defaultValue={state.organization?.name}
                      required
                      maxLength={100}
                      disabled={!can("organization.manage")}
                    />
                  </label>
                  <label>
                    Workspace slug
                    <input
                      name="slug"
                      defaultValue={state.organization?.slug}
                      required
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      maxLength={60}
                      disabled={!can("organization.manage")}
                    />
                    <span className="field-hint">
                      Lowercase letters, numbers and hyphens.
                    </span>
                  </label>
                  <button
                    className="button primary"
                    disabled={!can("organization.manage") || busy}
                  >
                    Save workspace
                  </button>
                  {!can("organization.manage") && (
                    <p className="field-hint">
                      Only owners and admins can change workspace settings.
                    </p>
                  )}
                </form>
              </section>
              <section className="panel settings-panel danger-zone">
                <div className="settings-description">
                  <h2>Workspace controls</h2>
                  <p>
                    Destructive actions require confirmation. Owners are
                    protected from leaving.
                  </p>
                </div>
                <div>
                  <button
                    className="button"
                    disabled={role === "OWNER" || busy}
                    title={
                      role === "OWNER"
                        ? "Transfer ownership before leaving."
                        : undefined
                    }
                    onClick={() => open("leave")}
                  >
                    Leave workspace
                  </button>
                  <button
                    className="button danger"
                    disabled={!can("organization.delete") || busy}
                    onClick={() => open("delete")}
                  >
                    Delete workspace
                  </button>
                  <p className="field-hint">
                    {state.demo
                      ? "Demo workspaces can be restored with Reset sandbox."
                      : "Deletion removes this workspace and its resources."}
                  </p>
                </div>
              </section>
              <section className="panel settings-panel">
                <div className="settings-description">
                  <h2>Session</h2>
                  <p>
                    {state.demo
                      ? "An isolated demo session, not a production account."
                      : "Sign out of your current session."}
                  </p>
                </div>
                <div>
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => act("session.logout")}
                  >
                    <LogOut size={16} />
                    Sign out
                  </button>
                  {state.sandboxExpiresAt && (
                    <p className="field-hint">
                      Sandbox expires {time(state.sandboxExpiresAt)}.
                    </p>
                  )}
                </div>
              </section>
            </div>
          )}
          {view === "platform" &&
            (platform ? (
              <>
                <div className="info-banner">
                  <ShieldCheck size={19} />
                  <p>
                    <strong>Platform Admin Demo</strong> — this view contains
                    only your isolated sandbox. Normal workspace membership does
                    not grant platform access.
                  </p>
                </div>
                <section className="metric-strip">
                  <div>
                    <span>Users in sandbox</span>
                    <strong>{platform.users.length}</strong>
                    <Users />
                  </div>
                  <div>
                    <span>Organizations</span>
                    <strong>{platform.organizations.length}</strong>
                    <FolderKanban />
                  </div>
                  <div>
                    <span>Demo sessions</span>
                    <strong>{platform.sessions.length}</strong>
                    <ShieldCheck />
                  </div>
                  <div>
                    <span>Plan distribution</span>
                    <strong>
                      {platform.planDistribution.length}
                      <small>Plan types in use</small>
                    </strong>
                    <CreditCard />
                  </div>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Organizations</h2>
                      <p>Workspace configuration at a glance</p>
                    </div>
                  </div>
                  <GridTable
                    className="data-table platform-table"
                    label="Organizations"
                  >
                    <GridRow className="table-header" header>
                      <span>Organization</span>
                      <span>Plan</span>
                      <span>Members</span>
                    </GridRow>
                    {platform.organizations.map((x) => (
                      <GridRow className="table-row" key={x.id}>
                        <strong>{x.name}</strong>
                        <span>{titleCase(x.plan)}</span>
                        <span>{x.memberCount}</span>
                      </GridRow>
                    ))}
                  </GridTable>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Sandbox users</h2>
                      <p>No private credentials or user impersonation.</p>
                    </div>
                  </div>
                  <div className="platform-users">
                    {platform.users.map((x) => (
                      <div className="person" key={x.id}>
                        <span className="avatar">{initials(x.name)}</span>
                        <div>
                          <strong>{x.name}</strong>
                          <p>{x.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Demo session lifecycle</h2>
                      <p>
                        Sessions expire; cleanup only removes their associated
                        sandbox.
                      </p>
                    </div>
                  </div>
                  <div className="request-list">
                    {platform.sessions.map((x) => (
                      <div key={x.id}>
                        <span>Created {time(x.createdAt)}</span>
                        <span>Expires {time(x.expiresAt)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <div className="panel empty">
                <ShieldCheck />
                <p>{error || "Loading the platform overview…"}</p>
              </div>
            ))}
          {footer}
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {dialog && (
        <Dialog
          title={
            dialog.kind === "project"
              ? dialog.data?.id
                ? "Edit project"
                : "Create project"
              : dialog.kind === "invite"
                ? "Invite a teammate"
                : dialog.kind === "organization"
                  ? "Create workspace"
                  : dialog.kind === "key"
                    ? newKey
                      ? "Your API key"
                      : "Create API key"
                    : dialog.kind === "outbox"
                      ? "Development outbox"
                      : dialog.kind === "command"
                        ? "Quick navigation"
                        : dialog.kind === "reset"
                          ? "Reset this sandbox?"
                          : dialog.kind === "delete"
                            ? "Delete workspace?"
                            : dialog.kind === "archive"
                              ? "Archive project?"
                              : dialog.kind === "remove"
                                ? "Remove teammate?"
                                : dialog.kind === "role"
                                  ? "Change member role?"
                                  : dialog.kind === "cancel"
                                    ? "Cancel subscription?"
                                    : dialog.kind === "leave"
                                      ? "Leave workspace?"
                                      : dialog.kind === "plan"
                                        ? `Switch to ${titleCase(dialog.data?.plan || "")}?`
                                        : "Confirm revocation"
          }
          subtitle={
            dialog.kind === "invite"
              ? "Demo invitations are delivered here, never to a real inbox."
              : dialog.kind === "key"
                ? "Keep this credential private. It will not be shown again."
                : undefined
          }
          onClose={() => {
            if (!busy) setDialog(null);
          }}
        >
          {dialogError && (
            <p className="error" role="alert">
              {dialogError}
            </p>
          )}
          {["project", "invite", "organization", "key", "delete"].includes(
            dialog.kind,
          ) &&
            !newKey && (
              <form onSubmit={submit} className="dialog-form">
                {dialog.kind === "project" && (
                  <>
                    <label>
                      Project name
                      <input
                        name="name"
                        required
                        maxLength={120}
                        defaultValue={dialog.data?.name}
                        autoFocus
                      />
                    </label>
                    <label>
                      Description
                      <textarea
                        name="description"
                        rows={3}
                        maxLength={1000}
                        defaultValue={dialog.data?.description}
                      />
                    </label>
                    <label>
                      Status
                      <select
                        name="status"
                        defaultValue={dialog.data?.status || "ACTIVE"}
                      >
                        <option value="ACTIVE">Active</option>
                        <option value="PAUSED">Paused</option>
                        <option value="ARCHIVED">Archived</option>
                      </select>
                    </label>
                  </>
                )}
                {dialog.kind === "invite" && (
                  <>
                    <label>
                      Email address
                      <input
                        name="email"
                        type="email"
                        required
                        autoFocus
                        maxLength={254}
                        placeholder="teammate@example.test"
                      />
                    </label>
                    <label>
                      Role
                      <select name="role" defaultValue="MEMBER">
                        <option value="ADMIN">Admin</option>
                        <option value="MEMBER">Member</option>
                        <option value="VIEWER">Viewer</option>
                      </select>
                    </label>
                    <p className="field-hint">
                      The invitation expires and can only be accepted once.
                    </p>
                  </>
                )}
                {dialog.kind === "organization" && (
                  <>
                    <label>
                      Workspace name
                      <input name="name" required maxLength={100} autoFocus />
                    </label>
                    <label>
                      Slug
                      <input
                        name="slug"
                        required
                        maxLength={60}
                        pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                        placeholder="my-workspace"
                      />
                      <span className="field-hint">
                        Lowercase letters, numbers and hyphens.
                      </span>
                    </label>
                  </>
                )}
                {dialog.kind === "key" && (
                  <>
                    <label>
                      Key name
                      <input
                        name="name"
                        required
                        maxLength={100}
                        autoFocus
                        placeholder="Internal integration"
                      />
                    </label>
                    <label>
                      Scope
                      <input value="projects:read" readOnly />
                    </label>
                    <p className="field-hint">
                      This key can list projects in the current workspace.
                    </p>
                  </>
                )}
                {dialog.kind === "delete" && (
                  <>
                    <p>
                      This removes <strong>{state.organization?.name}</strong>{" "}
                      and its resources.{" "}
                      {state.demo &&
                        "Reset sandbox can restore the seeded demo."}
                    </p>
                    <label>
                      Type the workspace name to confirm
                      <input
                        name="confirmation"
                        required
                        autoFocus
                        autoComplete="off"
                      />
                    </label>
                  </>
                )}
                <div className="dialog-actions">
                  <button
                    className="button"
                    type="button"
                    disabled={busy}
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className={`button ${dialog.kind === "delete" ? "danger" : "primary"}`}
                    disabled={busy}
                  >
                    {busy
                      ? "Saving…"
                      : dialog.kind === "invite"
                        ? "Send invitation"
                        : dialog.kind === "delete"
                          ? "Delete workspace"
                          : dialog.kind === "key"
                            ? "Create key"
                            : "Save"}
                  </button>
                </div>
              </form>
            )}
          {newKey && (
            <div className="key-reveal">
              <p className="info-banner">
                Shown once. Copy this key before closing.
              </p>
              <label>
                API key
                <textarea readOnly value={newKey} rows={3} />
              </label>
              <button
                className="button primary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(newKey);
                    setCopied(true);
                  } catch {
                    setDialogError(
                      "Select and copy the key from the field above.",
                    );
                  }
                }}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}{" "}
                {copied ? "Copied" : "Copy key"}
              </button>
              <button
                className="button"
                onClick={() => {
                  setNewKey("");
                  setDialog(null);
                }}
              >
                Done
              </button>
            </div>
          )}
          {dialog.kind === "outbox" && (
            <div className="outbox-list">
              {can("outbox.read") ? (
                state.outbox.length ? (
                  state.outbox.map((email) => (
                    <article key={email.id}>
                      <div className="outbox-meta">
                        <Mail size={16} />
                        <span>To: {email.to}</span>
                        <time>{date(email.createdAt)}</time>
                      </div>
                      <h3>{email.subject}</h3>
                      <pre>{email.text}</pre>
                      {email.invitationId && (
                        <button
                          className="button primary small"
                          disabled={busy}
                          onClick={async () => {
                            const result = await act(
                              "demo.invitation.accept",
                              { id: email.invitationId },
                              "Invitation accepted in this sandbox.",
                            );
                            if (result) setDialog(null);
                          }}
                        >
                          Open demo invitation <ArrowUpRight size={15} />
                        </button>
                      )}
                    </article>
                  ))
                ) : (
                  <div className="empty">
                    <Mail />
                    <h3>Your outbox is empty</h3>
                    <p>
                      Invite a teammate or change a plan to generate a demo
                      message.
                    </p>
                  </div>
                )
              ) : (
                <div className="empty">
                  <ShieldCheck />
                  <h3>Restricted to owners and admins</h3>
                  <p>Switch your demo role to review development messages.</p>
                </div>
              )}
            </div>
          )}
          {dialog.kind === "command" && (
            <div className="command-list">
              {navigation.map(({ id, label, icon: Icon }) => (
                <Link
                  key={id}
                  href={`/app/${id}`}
                  onClick={() => setDialog(null)}
                >
                  <Icon size={18} />
                  <span>Go to {label}</span>
                  <ArrowRight size={15} />
                </Link>
              ))}
              <button
                disabled={!can("project.write")}
                onClick={() => open("project")}
              >
                <Plus size={18} />
                <span>Create project</span>
              </button>
              <button onClick={() => open("organization")}>
                <Plus size={18} />
                <span>Create workspace</span>
              </button>
            </div>
          )}
          {[
            "reset",
            "archive",
            "remove",
            "role",
            "cancel",
            "leave",
            "plan",
            "revoke-key",
            "revoke-invite",
          ].includes(dialog.kind) && (
            <div className="confirmation">
              <p>
                {dialog.kind === "reset"
                  ? "Your demo mutations will be removed and the original fictional data restored. Other visitors are unaffected."
                  : dialog.kind === "archive"
                    ? `${dialog.data?.name} will move to Archived. You can change its status later.`
                    : dialog.kind === "remove"
                      ? `${dialog.data?.name} will lose access to this workspace.`
                      : dialog.kind === "role"
                        ? `${dialog.data?.name} will become a ${titleCase(dialog.data?.role || "").toLowerCase()}. Access changes immediately.`
                        : dialog.kind === "cancel"
                          ? "Cancellation is scheduled for the end of the current period. This demo never charges real money."
                          : dialog.kind === "leave"
                            ? "You will lose access to this workspace. Another member will need to invite you back."
                            : dialog.kind === "plan"
                              ? "Your demo subscription will change immediately. No payment will be collected."
                              : `${dialog.data?.name} will no longer grant access. This cannot be undone.`}
              </p>
              <div className="dialog-actions">
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => setDialog(null)}
                >
                  Cancel
                </button>
                <button
                  className={`button ${["remove", "leave", "revoke-key", "revoke-invite"].includes(dialog.kind) ? "danger" : "primary"}`}
                  disabled={busy}
                  onClick={async () => {
                    const kind = dialog.kind;
                    const data = dialog.data;
                    const result = await act(
                      kind === "reset"
                        ? "demo.reset"
                        : kind === "archive"
                          ? "project.update"
                          : kind === "remove"
                            ? "member.remove"
                            : kind === "role"
                              ? "member.role"
                              : kind === "cancel"
                                ? "billing.cancel"
                                : kind === "leave"
                                  ? "organization.leave"
                                  : kind === "plan"
                                    ? "billing.plan"
                                    : kind === "revoke-key"
                                      ? "key.revoke"
                                      : "invitation.revoke",
                      kind === "archive"
                        ? { ...data, status: "ARCHIVED" }
                        : data || {},
                      kind === "reset" ? "Sandbox restored." : "Changes saved.",
                    );
                    if (result) setDialog(null);
                  }}
                >
                  {busy ? "Applying…" : "Confirm"}
                </button>
              </div>
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}

function LayersFallback() {
  return <FolderKanban size={30} />;
}

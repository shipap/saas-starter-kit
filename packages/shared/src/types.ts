export type Role = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
export type Plan = "FREE" | "PRO" | "BUSINESS";
export type ProjectStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type Theme = "light" | "dark" | "system";
export interface AppState {
  user: { id: string; name: string; email: string; theme: Theme };
  demo: boolean;
  sandboxExpiresAt: string | null;
  organizations: { id: string; name: string; slug: string; role: Role }[];
  organization: { id: string; name: string; slug: string; role: Role };
  permissions: string[];
  projects: {
    id: string;
    name: string;
    description: string;
    status: ProjectStatus;
    ownerId: string | null;
    ownerName: string;
    createdAt: string;
  }[];
  members: {
    id: string;
    userId: string;
    name: string;
    email: string;
    role: Role;
  }[];
  invitations: {
    id: string;
    email: string;
    role: Role;
    status: string;
    expiresAt: string;
  }[];
  apiKeys: {
    id: string;
    name: string;
    prefix: string;
    lastFour: string;
    scopes: string[];
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }[];
  usage: {
    monthRequests: number;
    totalRequests: number;
    daily: { date: string; count: number }[];
    recent: { id: string; path: string; status: number; createdAt: string }[];
  };
  audit: {
    id: string;
    actor: string;
    event: string;
    target: string;
    createdAt: string;
  }[];
  billing: {
    plan: Plan;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string;
  };
  outbox: {
    id: string;
    to: string;
    subject: string;
    text: string;
    createdAt: string;
    invitationId?: string;
  }[];
}
export interface PlatformState {
  demo: boolean;
  users: { id: string; name: string; email: string }[];
  organizations: {
    id: string;
    name: string;
    plan: Plan;
    memberCount: number;
  }[];
  sessions: { id: string; expiresAt: string; createdAt: string }[];
  planDistribution: { plan: Plan; count: number }[];
}

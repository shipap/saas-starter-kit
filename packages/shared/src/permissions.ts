import type { Role } from "./types";

export const permissionNames = [
  "project.read",
  "project.write",
  "team.read",
  "team.manage",
  "keys.read",
  "keys.manage",
  "audit.read",
  "organization.read",
  "organization.manage",
  "organization.delete",
  "organization.leave",
  "billing.read",
  "billing.manage",
  "outbox.read",
] as const;
export type Permission = (typeof permissionNames)[number];

const rolePermissions: Record<Role, readonly Permission[]> = {
  OWNER: permissionNames,
  ADMIN: permissionNames.filter(
    (name) => name !== "billing.manage" && name !== "organization.delete",
  ),
  MEMBER: [
    "project.read",
    "project.write",
    "team.read",
    "audit.read",
    "organization.read",
    "organization.leave",
    "billing.read",
  ],
  VIEWER: [
    "project.read",
    "team.read",
    "audit.read",
    "organization.read",
    "organization.leave",
    "billing.read",
  ],
};

export function permissionsForRole(role: Role): Permission[] {
  return [...rolePermissions[role]];
}

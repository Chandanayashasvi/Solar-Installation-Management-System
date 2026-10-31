export type Role = "ADMIN" | "SALES" | "SURVEYOR" | "WAREHOUSE" | "TECHNICIAN" | "SUPPORT" | "FINANCE";

export const canAccessRole = (userRole: Role, allowedRoles: Role[]) =>
  userRole === "ADMIN" || allowedRoles.includes(userRole);

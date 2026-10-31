import { describe, expect, it } from "vitest";
import { canAccessRole, type Role } from "../src/lib/roles";

describe("role access", () => {
  it("keeps administrator access unrestricted", () => {
    const roles: Role[] = ["SALES", "SURVEYOR", "WAREHOUSE", "TECHNICIAN", "SUPPORT", "FINANCE"];
    for (const role of roles) expect(canAccessRole("ADMIN", [role])).toBe(true);
    expect(canAccessRole("ADMIN", [])).toBe(true);
  });

  it("restricts survey and finance privileges to their intended roles", () => {
    expect(canAccessRole("SURVEYOR", ["SURVEYOR"])).toBe(true);
    expect(canAccessRole("SALES", ["SURVEYOR"])).toBe(false);
    expect(canAccessRole("FINANCE", ["FINANCE"])).toBe(true);
    expect(canAccessRole("WAREHOUSE", ["FINANCE"])).toBe(false);
  });
});
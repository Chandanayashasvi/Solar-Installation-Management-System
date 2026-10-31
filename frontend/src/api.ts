export interface User { id: string; name: string; role: "ADMIN" | "SALES" | "WAREHOUSE" | "TECHNICIAN" | "SUPPORT" }
const KEY = "solar_token";
export const getToken = () => sessionStorage.getItem(KEY);
export const setToken = (t: string | null) => (t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY));
export class ApiError extends Error { constructor(m: string, public issues?: { path: string; message: string }[]) { super(m); } }
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; raw?: boolean } = {}): Promise<T> {
  const res = await fetch("/api" + path, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(getToken() ? { Authorization: "Bearer " + getToken() } : {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && getToken()) { setToken(null); location.href = "/login"; }
  if (opts.raw && res.ok) return (await res.blob()) as any;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.issues?.map((i: any) => `${i.path}: ${i.message}`).join("; ") || data.error || "Request failed", data.issues);
  return data;
}
export const inr = (n: number | string) => "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
export const dt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const toast = (msg: string, ok = true) => window.dispatchEvent(new CustomEvent("toast", { detail: { msg, ok } }));
export const run = async (fn: () => Promise<unknown>, success?: string) => { try { await fn(); if (success) toast(success); return true; } catch (e: any) { toast(e.message, false); return false; } };

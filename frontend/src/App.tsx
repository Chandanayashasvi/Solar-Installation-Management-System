import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { BarChart3, ChevronLeft, ChevronRight, ClipboardCheck, CreditCard, ClipboardList, Landmark, LogOut, Menu, Package, Search, ShoppingCart, TrendingUp, Users as UsersIcon, Wallet, Wrench, Sun } from "lucide-react";
import { api, getToken, setToken, User } from "./api";
import { Toasts } from "./ui";
import Login from "./pages/Login";
import Apply from "./pages/Apply";
import Dashboard from "./pages/Dashboard";
import Enquiries from "./pages/Enquiries";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Jobs from "./pages/Jobs";
import Support from "./pages/Support";
import Quote from "./pages/Quote";
import Surveys from "./pages/Surveys";
import Finance from "./pages/Finance";
import Users from "./pages/Users";
import Subsidies from "./pages/Subsidies";
import TechnicianPayments from "./pages/TechnicianPayments";
import RoleDashboard from "./pages/RoleDashboard";

const NAV = [
  { to: "/", label: "Dashboard", icon: BarChart3, roles: ["ADMIN", "SALES", "SURVEYOR", "WAREHOUSE", "TECHNICIAN", "SUPPORT", "FINANCE"] },
  { to: "/finance", label: "Finance dashboard", icon: TrendingUp, roles: ["ADMIN", "FINANCE"] },
  { to: "/subsidies", label: "Subsidy tracking", icon: Landmark, roles: ["ADMIN", "FINANCE"] },
  { to: "/technician-payments", label: "Technician payments", icon: Wallet, roles: ["ADMIN", "FINANCE"] },
  { to: "/enquiries", label: "Enquiries", icon: ClipboardList, roles: ["ADMIN", "SALES"] },
  { to: "/surveys", label: "Site surveys", icon: ClipboardCheck, roles: ["ADMIN", "SURVEYOR"] },
  { to: "/orders", label: "Orders", icon: ShoppingCart, roles: ["ADMIN", "SALES", "FINANCE", "WAREHOUSE"] },
  { to: "/payments", label: "Payment history", icon: CreditCard, roles: ["ADMIN", "SALES", "FINANCE"] },
  { to: "/inventory", label: "Inventory", icon: Package, roles: ["ADMIN", "WAREHOUSE"] },
  { to: "/jobs", label: "Installations", icon: Wrench, roles: ["ADMIN", "TECHNICIAN"] },
  { to: "/support", label: "Warranty & Service", icon: Search, roles: ["ADMIN", "SUPPORT"] },
  { to: "/users", label: "Team and access", icon: UsersIcon, roles: ["ADMIN"] },
];
const home: Record<User["role"], string> = { ADMIN: "/", SALES: "/", SURVEYOR: "/", WAREHOUSE: "/", TECHNICIAN: "/", SUPPORT: "/", FINANCE: "/" };

function RoleRoute({ user, roles, children }: { user: User; roles: User["role"][]; children: ReactNode }) {
  return user.role === "ADMIN" || roles.includes(user.role) ? <>{children}</> : <Navigate to={home[user.role]} replace />;
}

function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const nav = useNavigate();
  const location = useLocation();
  const items = NAV.filter((n) => n.roles.includes(user.role));
  const currentPage = items.find((item) => item.to !== "/" && location.pathname.startsWith(item.to)) ?? items[0];
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <button type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className={`${open ? "block" : "hidden"} fixed inset-0 z-30 bg-slate-950/40 md:hidden`} />
      <aside className={`no-print fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#163a31] p-3 text-white shadow-xl transition-all md:static md:translate-x-0 md:shadow-none ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "md:w-20" : "md:w-64"}`}>
        <div className={`mb-7 flex h-11 items-center gap-2 px-2 text-lg font-bold ${collapsed ? "md:justify-center md:px-0" : ""}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10"><Sun className="text-amber-300" size={20} /></span>
          <span className={collapsed ? "md:hidden" : ""}>Solar Pro</span>
        </div>
        <nav aria-label="Main navigation" className="flex-1 space-y-1">{items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => setOpen(false)} title={collapsed ? n.label : undefined} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${collapsed ? "md:justify-center md:px-0" : ""} ${isActive ? "bg-white/15 font-medium text-white" : "text-white/75 hover:bg-white/10 hover:text-white"}`}><n.icon size={18} /><span className={collapsed ? "md:hidden" : ""}>{n.label}</span></NavLink>))}</nav>
        <button type="button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} className="hidden items-center justify-center rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white md:flex">
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="no-print sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
            <div><p className="text-xs text-slate-400">Solar Pro / Workspace</p><p className="text-sm font-semibold text-navy">{currentPage?.label ?? "Dashboard"}</p></div>
          </div>
          <div className="relative">
            <button type="button" aria-expanded={profileOpen} aria-label={`Account menu for ${user.name}`} onClick={() => setProfileOpen(!profileOpen)} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-slate-50">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-solar-100 text-sm font-semibold text-solar-800">{user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
              <span className="hidden sm:block"><span className="block text-sm font-medium">{user.name}</span><span className="block text-xs text-slate-500">{user.role.toLowerCase()}</span></span>
            </button>
            {profileOpen && <div className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              <div className="border-b px-3 py-2"><p className="text-sm font-medium">{user.name}</p><p className="text-xs text-slate-500">{user.email}</p></div>
              <button type="button" className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50" onClick={() => { setToken(null); onLogout(); setProfileOpen(false); nav("/login"); }}><LogOut size={16} />Sign out</button>
            </div>}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
          <Routes>
            <Route path="/" element={user.role === "ADMIN" ? <Dashboard /> : <RoleDashboard user={user} />} />
            <Route path="/finance" element={<RoleRoute user={user} roles={["FINANCE"]}><Finance /></RoleRoute>} />
            <Route path="/subsidies" element={<RoleRoute user={user} roles={["FINANCE"]}><Subsidies /></RoleRoute>} />
            <Route path="/technician-payments" element={<RoleRoute user={user} roles={["FINANCE"]}><TechnicianPayments /></RoleRoute>} />
            <Route path="/enquiries" element={<RoleRoute user={user} roles={["SALES"]}><Enquiries user={user} /></RoleRoute>} />
            <Route path="/surveys" element={<RoleRoute user={user} roles={["SURVEYOR"]}><Surveys user={user} /></RoleRoute>} />
            <Route path="/surveys/history" element={<RoleRoute user={user} roles={["SURVEYOR"]}><Surveys user={user} /></RoleRoute>} />
            <Route path="/orders" element={<RoleRoute user={user} roles={["SALES", "FINANCE", "WAREHOUSE"]}><Orders user={user} /></RoleRoute>} />
            <Route path="/payments" element={<RoleRoute user={user} roles={["SALES", "FINANCE"]}><Orders user={user} title="Payment history" /></RoleRoute>} />
            <Route path="/inventory" element={<RoleRoute user={user} roles={["WAREHOUSE"]}><Inventory /></RoleRoute>} />
            <Route path="/jobs" element={<RoleRoute user={user} roles={["TECHNICIAN"]}><Jobs /></RoleRoute>} />
            <Route path="/support" element={<RoleRoute user={user} roles={["SUPPORT"]}><Support /></RoleRoute>} />
            <Route path="/users" element={<RoleRoute user={user} roles={["ADMIN"]}><Users /></RoleRoute>} />
            <Route path="/quotes/:id" element={<RoleRoute user={user} roles={["SALES"]}><Quote /></RoleRoute>} />
            <Route path="*" element={<Navigate to={home[user.role]} />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState<User | null | undefined>(getToken() ? undefined : null);
  useEffect(() => { if (getToken()) api("/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null)); }, []);
  return (<>
    <Routes>
      <Route path="/apply" element={<Apply />} />
      <Route path="/login" element={<Login onLogin={setUser} />} />
      <Route path="*" element={user === undefined ? <p className="p-8">Loading…</p> : user ? <Shell user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" />} />
    </Routes><Toasts /></>);
}

import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { BarChart3, ClipboardList, LogOut, Menu, Package, Search, ShoppingCart, Wrench, Sun } from "lucide-react";
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

const NAV = [
  { to: "/", label: "Dashboard", icon: BarChart3, roles: ["ADMIN"] },
  { to: "/enquiries", label: "Enquiries", icon: ClipboardList, roles: ["ADMIN", "SALES"] },
  { to: "/orders", label: "Orders", icon: ShoppingCart, roles: ["ADMIN", "SALES", "WAREHOUSE"] },
  { to: "/inventory", label: "Inventory", icon: Package, roles: ["ADMIN", "WAREHOUSE"] },
  { to: "/jobs", label: "Installations", icon: Wrench, roles: ["ADMIN", "TECHNICIAN"] },
  { to: "/support", label: "Warranty & Service", icon: Search, roles: ["ADMIN", "SUPPORT"] },
];
const home: Record<string, string> = { ADMIN: "/", SALES: "/enquiries", WAREHOUSE: "/inventory", TECHNICIAN: "/jobs", SUPPORT: "/support" };

function Shell({ user }: { user: User }) {
  const [open, setOpen] = useState(false); const nav = useNavigate();
  const items = NAV.filter((n) => n.roles.includes(user.role));
  return (
    <div className="flex min-h-screen">
      <aside className={`${open ? "block" : "hidden"} no-print fixed inset-y-0 z-40 w-60 bg-solar-800 p-4 text-white md:static md:block`}>
        <div className="mb-6 flex items-center gap-2 text-lg font-bold"><Sun className="text-amber-300" /> SunPower</div>
        <nav className="space-y-1">{items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === "/"} onClick={() => setOpen(false)} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/15" : "hover:bg-white/10"}`}><n.icon size={16} />{n.label}</NavLink>))}</nav>
      </aside>
      <div className="flex-1">
        <header className="no-print flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <button className="md:hidden" aria-label="Menu" onClick={() => setOpen(!open)}><Menu /></button>
          <span className="text-sm text-slate-500">Rooftop solar operations</span>
          <div className="flex items-center gap-3 text-sm"><span>{user.name} <span className="text-slate-400">({user.role})</span></span>
            <button aria-label="Log out" onClick={() => { setToken(null); nav("/login"); }}><LogOut size={16} /></button></div>
        </header>
        <main className="mx-auto max-w-6xl p-4">
          <Routes>
            <Route path="/" element={user.role === "ADMIN" ? <Dashboard /> : <Navigate to={home[user.role]} />} />
            <Route path="/enquiries" element={<Enquiries />} /><Route path="/orders" element={<Orders user={user} />} />
            <Route path="/inventory" element={<Inventory />} /><Route path="/jobs" element={<Jobs />} />
            <Route path="/support" element={<Support />} /><Route path="/quotes/:id" element={<Quote />} />
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
      <Route path="*" element={user === undefined ? <p className="p-8">Loading…</p> : user ? <Shell user={user} /> : <Navigate to="/login" />} />
    </Routes><Toasts /></>);
}

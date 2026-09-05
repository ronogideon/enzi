import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

interface NavItem { to: string; label: string; roles: Role[]; }

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
  { to: "/orders", label: "Orders", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
  { to: "/products", label: "Products", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/stock", label: "Stock & Audits", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/promotions", label: "Promotions", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/customers", label: "Customers", roles: ["SUPERADMIN", "ADMIN", "SUPPORT"] },
  { to: "/sms", label: "SMS Marketing", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/delivery", label: "Delivery", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/staff", label: "Staff accounts", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/settings", label: "Settings", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
];

export function Layout() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();

  const items = NAV.filter((n) => staff && n.roles.includes(staff.role));

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen">
      {/* sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-line bg-ink-800/40 lg:flex">
        <div className="px-6 py-6">
          <p className="font-display text-xl font-extrabold tracking-tight text-white">
            ENZI
          </p>
          <p className="text-[10px] tracking-[0.4em] text-muted">ADMIN</p>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive ? "bg-ink-hover text-white" : "text-muted hover:bg-ink-hover hover:text-cloud"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-ink-line p-4">
          <p className="text-sm font-medium text-cloud">{staff?.name}</p>
          <p className="text-xs text-faint">{staff?.role}</p>
          <button onClick={handleLogout} className="mt-3 text-xs text-muted hover:text-danger">
            Sign out
          </button>
        </div>
      </aside>

      {/* main */}
      <div className="flex flex-1 flex-col">
        {/* mobile top bar */}
        <header className="flex items-center justify-between border-b border-ink-line px-5 py-4 lg:hidden">
          <span className="font-display font-extrabold text-white">ENZI ADMIN</span>
          <button onClick={handleLogout} className="text-xs text-muted">Sign out</button>
        </header>
        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-b border-ink-line px-3 py-2 lg:hidden">
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-xs ${
                  isActive ? "bg-ink-hover text-white" : "text-muted"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <main className="mx-auto w-full max-w-shell flex-1 px-5 py-8 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

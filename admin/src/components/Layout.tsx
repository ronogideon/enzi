import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";

interface NavItem { to: string; label: string; short: string; roles: Role[]; }

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", short: "Home", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
  { to: "/orders", label: "Orders", short: "Orders", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
  { to: "/products", label: "Products", short: "Products", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/stock", label: "Stock & Audits", short: "Stock", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/promotions", label: "Promotions", short: "Promos", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/customers", label: "Customers", short: "People", roles: ["SUPERADMIN", "ADMIN", "SUPPORT"] },
  { to: "/sms", label: "SMS Marketing", short: "SMS", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/delivery", label: "Delivery", short: "Delivery", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/staff", label: "Staff accounts", short: "Staff", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/settings", label: "Settings", short: "Settings", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
];

/**
 * Admin shell.
 *
 * Mobile used to get a horizontally scrolling strip of ten tab labels, which
 * meant half the sections were off-screen with no indication they existed. It's
 * now a proper slide-in drawer from the left, plus a bottom bar carrying the
 * four destinations someone actually uses on a phone — this is a tool people
 * hold while standing at a packing bench, so orders and products need to be one
 * thumb-tap away.
 */
export function Layout() {
  const { staff, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const items = NAV.filter((n) => staff && n.roles.includes(staff.role));
  // The four most-used destinations, in the order they come up during a shift.
  const quick = items.filter((n) => ["/", "/orders", "/products", "/stock"].includes(n.to)).slice(0, 4);

  // Navigating should always close the drawer, however it was triggered.
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Lock the page behind the drawer so the content doesn't scroll underneath.
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2.5 text-sm transition-colors ${
      isActive ? "bg-ink-hover text-white" : "text-muted hover:bg-ink-hover hover:text-cloud"
    }`;

  const brand = (
    <div>
      <p className="font-display text-xl font-extrabold tracking-tight text-white">ENZI</p>
      <p className="text-[10px] tracking-[0.4em] text-muted">ADMIN</p>
    </div>
  );

  const footer = (
    <div className="border-t border-ink-line p-4">
      <p className="truncate text-sm font-medium text-cloud">{staff?.name}</p>
      <p className="text-xs text-faint">{staff?.role}</p>
      <button onClick={handleLogout} className="mt-3 text-xs text-muted transition-colors hover:text-danger">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-ink-line bg-ink-800/40 lg:flex">
        <div className="px-6 py-6">{brand}</div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={navLinkClass}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        {footer}
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${menuOpen ? "" : "pointer-events-none"}`}
        aria-hidden={!menuOpen}
      >
        <div
          onClick={() => setMenuOpen(false)}
          className="absolute inset-0 bg-black/60 transition-opacity duration-200"
          style={{ opacity: menuOpen ? 1 : 0 }}
        />
        <aside
          className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-ink-line bg-ink-900 shadow-2xl"
          style={{
            transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
            // The iOS drawer curve: quick to leave the edge, settles gently.
            transition: "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <div className="flex items-center justify-between px-6 py-5">
            {brand}
            <button
              onClick={() => setMenuOpen(false)}
              className="grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-ink-hover hover:text-cloud"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
            {items.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === "/"} className={navLinkClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          {footer}
        </aside>
      </div>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-line bg-ink/90 px-4 py-3 backdrop-blur lg:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-cloud transition-colors hover:bg-ink-hover active:scale-95"
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
            </svg>
          </button>
          <span className="font-display font-extrabold text-white">ENZI ADMIN</span>
        </header>

        {/* pb-24 on mobile keeps the bottom bar from covering the last row */}
        <main className="mx-auto w-full max-w-shell flex-1 px-4 py-6 pb-24 sm:px-8 sm:py-8 lg:pb-8">
          <Outlet />
        </main>

        {/* Thumb-reachable bar for the handful of screens used on the floor */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {quick.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                `py-3 text-center text-xs transition-colors ${
                  isActive ? "text-white" : "text-muted"
                }`
              }
            >
              {n.short}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useIdleTimeout, IdleWarning } from "@/lib/session";
import { Icon, type IconName } from "@/components/Icons";
import type { Role } from "@/lib/types";

// Injected at build time from package.json (see vite.config define).
declare const __APP_VERSION__: string;
const APP_VERSION = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

interface NavItem {
  to: string;
  label: string;
  short: string;
  icon: IconName;
  roles: Role[];
  group: "Shop" | "Content" | "Admin";
}

/**
 * Grouped so the sidebar reads as three short lists rather than one wall of
 * twelve links — the eye can find "Blog" under Content without scanning all of
 * them.
 */
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", short: "Home", icon: "Dashboard", group: "Shop", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
  { to: "/orders", label: "Orders", short: "Orders", icon: "Orders", group: "Shop", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
  { to: "/products", label: "Products", short: "Products", icon: "Products", group: "Shop", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/categories", label: "Categories", short: "Groups", icon: "Promotions", group: "Shop", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/stock", label: "Stock & Audits", short: "Stock", icon: "Stock", group: "Shop", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/customers", label: "Customers", short: "People", icon: "Customers", group: "Shop", roles: ["SUPERADMIN", "ADMIN", "SUPPORT"] },

  { to: "/blog", label: "Blog", short: "Blog", icon: "Blog", group: "Content", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/faqs", label: "FAQs", short: "FAQs", icon: "Faq", group: "Content", roles: ["SUPERADMIN", "ADMIN", "STAFF"] },
  { to: "/promotions", label: "Promotions", short: "Promos", icon: "Promotions", group: "Content", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/sms", label: "SMS Marketing", short: "SMS", icon: "Sms", group: "Content", roles: ["SUPERADMIN", "ADMIN"] },

  { to: "/delivery", label: "Delivery", short: "Delivery", icon: "Delivery", group: "Admin", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/staff", label: "Staff accounts", short: "Staff", icon: "Staff", group: "Admin", roles: ["SUPERADMIN", "ADMIN"] },
  { to: "/settings", label: "Settings", short: "Settings", icon: "Settings", group: "Admin", roles: ["SUPERADMIN", "ADMIN", "STAFF", "SUPPORT"] },
];

const GROUPS: NavItem["group"][] = ["Shop", "Content", "Admin"];

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

  /**
   * The admin is often left open on a shared computer at the counter, where it
   * can read customer contact details and change payment credentials. Sign out
   * after 30 minutes idle, warning at two minutes so nobody loses a half-typed
   * product.
   */
  const { warningMsLeft, stayActive } = useIdleTimeout({
    enabled: !!staff,
    onTimeout: useCallback(() => {
      logout("idle");
      navigate("/login");
    }, [logout, navigate]),
  });

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
      isActive
        ? "bg-ink-hover text-white"
        : "text-muted hover:bg-ink-hover/60 hover:text-cloud"
    }`;

  /** One nav list, rendered identically in the sidebar and the drawer. */
  const navList = (
    <>
      {GROUPS.map((group) => {
        const groupItems = items.filter((n) => n.group === group);
        if (!groupItems.length) return null;
        return (
          <div key={group} className="mb-5">
            <p className="mb-1.5 whitespace-nowrap px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-faint transition-opacity duration-150 lg:opacity-0 lg:group-hover/sb:opacity-100">
              {group}
            </p>
            <div className="space-y-0.5">
              {groupItems.map((n) => {
                const Glyph = Icon[n.icon];
                return (
                  <NavLink key={n.to} to={n.to} end={n.to === "/"} className={navLinkClass}>
                    {({ isActive }) => (
                      <>
                        {/* Active marker on the left edge — a colour change
                            alone is easy to miss on a dark sidebar. */}
                        <span
                          className={`absolute left-0 h-5 w-0.5 rounded-r-full bg-white transition-opacity ${
                            isActive ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        <Glyph className={isActive ? "h-[18px] w-[18px] text-white" : "h-[18px] w-[18px]"} />
                        <span className="truncate whitespace-nowrap">{n.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );

  const brand = (
    <div>
      <p className="font-display text-xl font-extrabold tracking-tight text-white">ENZI</p>
      <p className="text-[10px] tracking-[0.4em] text-muted">ADMIN</p>
    </div>
  );

  const footer = (
    <div className="border-t border-ink-line p-4">
      {/* Performance sits with the person's own name — it's about their work,
          so this is where they'll look for it. */}
      <NavLink
        to="/metrics"
        className="block truncate text-sm font-medium text-cloud transition-colors hover:text-white"
      >
        {staff?.name}
      </NavLink>
      <NavLink
        to="/metrics"
        className="inline-flex items-center gap-1 text-xs text-faint transition-colors hover:text-muted"
      >
        <Icon.Trend className="h-3 w-3" />
        My performance
      </NavLink>
      <button
        onClick={handleLogout}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-danger"
      >
        <Icon.Logout className="h-4 w-4" />
        Sign out
      </button>
      {/* Build stamp — lets you confirm at a glance which version is actually
          deployed, instead of guessing whether a change shipped. */}
      <p className="mt-3 text-[10px] text-faint">v{APP_VERSION}</p>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      {/*
        Desktop sidebar: a 16-wide rail of icons that expands to the full menu
        when the pointer comes near it.

        The rail is a fixed overlay with a same-width spacer holding its place,
        so expanding never reflows the page — the product table keeps every
        pixel it had. That table is the widest screen in the admin and was
        being cut off; giving it back ~11rem is the difference between fitting
        at 100% zoom and not.
      */}
      <div className="hidden w-16 shrink-0 lg:block" aria-hidden />
      <aside
        className="group/sb fixed inset-y-0 left-0 z-40 hidden w-16 flex-col overflow-hidden border-r border-ink-line bg-ink-900 transition-[width] duration-200 ease-out hover:w-60 hover:shadow-2xl lg:flex"
      >
        <div className="flex h-[72px] shrink-0 items-center px-4">
          {/* Monogram while collapsed, full wordmark once open. */}
          <span className="font-display text-xl font-extrabold tracking-tight text-white group-hover/sb:hidden">
            E
          </span>
          <div className="hidden group-hover/sb:block">{brand}</div>
        </div>
        <nav className="relative flex-1 overflow-y-auto overflow-x-hidden px-3">
          {navList}
        </nav>
        <div className="hidden group-hover/sb:block">{footer}</div>
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
              <Icon.Close className="h-4 w-4" />
            </button>
          </div>
          <nav className="relative flex-1 overflow-y-auto px-3 pb-4">{navList}</nav>
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
            <Icon.Menu className="h-5 w-5" />
          </button>
          <span className="font-display font-extrabold text-white">ENZI ADMIN</span>
        </header>

        {/* pb-24 on mobile keeps the bottom bar from covering the last row */}
        <main className="mx-auto w-full max-w-shell flex-1 px-4 py-6 pb-24 sm:px-8 sm:py-8 lg:pb-8">
          <Outlet />
        </main>

        {warningMsLeft !== null && (
          <IdleWarning
            msLeft={warningMsLeft}
            onStay={stayActive}
            onSignOut={handleLogout}
          />
        )}

        {/* Thumb-reachable bar for the handful of screens used on the floor */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-ink-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {quick.map((n) => {
            const Glyph = Icon[n.icon];
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/"}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors ${
                    isActive ? "text-white" : "text-muted"
                  }`
                }
              >
                <Glyph className="h-5 w-5" />
                {n.short}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

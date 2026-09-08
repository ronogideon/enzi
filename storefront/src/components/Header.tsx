"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Category } from "@/lib/types";
import { useCart } from "@/lib/cart";
import { useAccount } from "@/lib/account";
import { Icon } from "@/components/Icons";

const NAV = [
  { label: "Home", href: "/" },
  { label: "Our Products", href: "/shop" },
  { label: "Reviews", href: "/reviews" },
  { label: "Blog", href: "/blog" },
  { label: "Delivery", href: "/delivery" },
  { label: "FAQs", href: "/faqs" },
  { label: "Contact Us", href: "/contact" },
];

export function Header({ categories }: { categories: Category[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const { count } = useCart();
  const { customer, ready } = useAccount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // close the mega-menu on outside click / route change / escape
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) router.push(`/shop?search=${encodeURIComponent(q)}`);
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 border-b border-ink-line bg-ink/80 backdrop-blur">
      {/* top contact strip */}
      <div className="hidden border-b border-ink-line/60 md:block">
        <div className="shell flex h-10 items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-6">
            <a href="tel:+254110050620" className="hover:text-cloud">
              +254 1100-50620
            </a>
            <a href="mailto:info@enzipackaging.co.ke" className="hover:text-cloud">
              info@enzipackaging.co.ke
            </a>
            <span className="hidden lg:inline">
              Dynamic Mall Suite ML135, Nairobi, Kenya
            </span>
          </div>
          <div className="flex items-center gap-5">
            {ready && (
              customer ? (
                <Link href="/account" className="flex items-center gap-1.5 transition-colors hover:text-cloud">
                  <Icon.User className="h-4 w-4" />
                  {customer.name?.split(" ")[0] ?? "My account"}
                </Link>
              ) : (
                <>
                  <Link href="/account/login" className="flex items-center gap-1.5 transition-colors hover:text-cloud">
                    <Icon.User className="h-4 w-4" />
                    Sign in
                  </Link>
                  <Link href="/account/register" className="hover:text-cloud">Create account</Link>
                </>
              )
            )}
            <Link href="/cart" className="flex items-center gap-1.5 transition-colors hover:text-cloud">
              <Icon.Cart className="h-4 w-4" />
              Cart
              {count > 0 && (
                <span className="grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {count}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>

      {/* main bar */}
      <div className="shell flex h-16 items-center gap-4">
        <Link href="/" className="mr-2 shrink-0 leading-none">
          <span className="block font-display text-2xl font-extrabold tracking-tight text-white">
            ENZI
          </span>
          <span className="block text-[10px] tracking-[0.4em] text-muted">
            PACKAGING
          </span>
        </Link>

        {/* desktop nav */}
        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          <NavLink href="/" active={isActive("/")}>
            Home
          </NavLink>
          <NavLink href="/shop" active={isActive("/shop")}>
            Our Products
          </NavLink>

          {/* category mega-menu — anchored, high z-index, closes cleanly */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-cloud hover:bg-ink-hover"
              aria-expanded={menuOpen}
            >
              <span aria-hidden>▦</span> Categories
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink-hover px-1 text-[11px] text-muted">
                {categories.length}
              </span>
              <span className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}>
                ⌄
              </span>
            </button>

            {menuOpen && (
              <div className="absolute left-1/2 top-full z-50 mt-3 w-[560px] max-w-[90vw] -translate-x-1/2 animate-fade-in">
                <div className="card overflow-hidden p-2 shadow-2xl">
                  <div className="px-4 pb-2 pt-3">
                    <p className="font-display text-lg font-bold text-white">
                      Browse categories
                    </p>
                    <p className="text-xs text-faint">
                      {categories.length} categories
                    </p>
                  </div>
                  <Link
                    href="/shop"
                    className="card-hover flex items-center justify-between rounded-xl border border-indigo/40 px-4 py-3"
                  >
                    <span className="font-medium">All products</span>
                    <span aria-hidden className="text-muted">→</span>
                  </Link>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {categories.map((c) => (
                      <Link
                        key={c.id}
                        href={`/shop?category=${c.slug}`}
                        className="card-hover flex items-center justify-between rounded-xl px-4 py-3 text-sm"
                      >
                        <span>{c.name}</span>
                        {c._count && (
                          <span className="text-xs text-faint">
                            {c._count.products}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/shop"
                    className="mt-2 block px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted hover:text-cloud"
                  >
                    View full shop →
                  </Link>
                </div>
              </div>
            )}
          </div>

          <NavLink href="/reviews" active={isActive("/reviews")}>
            Reviews
          </NavLink>
          <NavLink href="/blog" active={isActive("/blog")}>
            Blog
          </NavLink>
          <NavLink href="/delivery" active={isActive("/delivery")}>
            Delivery
          </NavLink>
          <NavLink href="/faqs" active={isActive("/faqs")}>
            FAQs
          </NavLink>
          <NavLink href="/contact" active={isActive("/contact")}>
            Contact Us
          </NavLink>
        </nav>

        {/* search */}
        <form onSubmit={submitSearch} className="hidden shrink-0 md:block">
          <div className="flex items-center rounded-full border border-ink-line bg-ink-800 pl-4 pr-1.5 focus-within:border-indigo/60">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-40 bg-transparent py-2 text-sm text-cloud placeholder:text-faint focus:outline-none lg:w-52"
              aria-label="Search products"
            />
            <button
              type="submit"
              className="grid h-8 w-8 place-items-center rounded-full text-muted hover:text-cloud"
              aria-label="Search"
            >
              ⌕
            </button>
          </div>
        </form>

        {/* Mobile controls. Cart sits beside the menu rather than inside it:
            it's the one destination a shopper reaches for repeatedly, and
            burying it behind a menu tap costs conversions. */}
        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <Link
            href="/cart"
            aria-label={count > 0 ? `Cart, ${count} items` : "Cart"}
            className="relative grid h-10 w-10 place-items-center rounded-full border border-ink-line transition-colors active:bg-ink-hover"
          >
            <Icon.Cart className="h-[18px] w-[18px]" />
            {count > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>

          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-full border border-ink-line transition-colors active:bg-ink-hover"
            aria-label="Menu"
            aria-expanded={mobileOpen}
          >
            <Icon.Menu className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="border-t border-ink-line bg-ink lg:hidden">
          <nav className="shell flex flex-col py-3">
            <MobileLink href="/shop" onClick={() => setMobileOpen(false)}>
              Our Products
            </MobileLink>
            {categories.map((c) => (
              <MobileLink
                key={c.id}
                href={`/shop?category=${c.slug}`}
                onClick={() => setMobileOpen(false)}
                muted
              >
                {c.name}
              </MobileLink>
            ))}
            {NAV.filter((n) => n.href !== "/shop").map((n) => (
              <MobileLink
                key={n.href}
                href={n.href}
                onClick={() => setMobileOpen(false)}
              >
                {n.label}
              </MobileLink>
            ))}
            <MobileLink href="/cart" onClick={() => setMobileOpen(false)}>
              Cart {count > 0 && `(${count})`}
            </MobileLink>
            <MobileLink
              href={customer ? "/account" : "/account/login"}
              onClick={() => setMobileOpen(false)}
            >
              {customer ? "My account" : "Sign in / Create account"}
            </MobileLink>
          </nav>
        </div>
      )}
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active ? "bg-ink-hover text-white" : "text-cloud hover:bg-ink-hover"
      }`}
    >
      {children}
    </Link>
  );
}

function MobileLink({
  href,
  onClick,
  muted,
  children,
}: {
  href: string;
  onClick: () => void;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`rounded-lg px-3 py-3 text-sm ${
        muted ? "pl-6 text-muted" : "text-cloud"
      } hover:bg-ink-hover`}
    >
      {children}
    </Link>
  );
}

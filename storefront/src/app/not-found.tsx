import Link from "next/link";

export default function NotFound() {
  return (
    <div className="shell grid min-h-[60vh] place-items-center py-24 text-center">
      <div>
        <p className="display text-7xl">404</p>
        <p className="mt-4 text-muted">
          We couldn’t find that page. It may have moved or never existed.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="btn-primary px-8">
            Go home
          </Link>
          <Link href="/shop" className="btn-ghost px-8">
            Browse shop
          </Link>
        </div>
      </div>
    </div>
  );
}

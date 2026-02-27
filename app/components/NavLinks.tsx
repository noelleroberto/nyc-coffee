"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Rendered inside the server-component layout.
 * On the customer-facing "/" route we hide the staff links.
 */
export default function NavLinks() {
  const pathname = usePathname();

  // Customer and barista views: no cross-navigation
  if (pathname === "/" || pathname === "/barista") return null;

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/"
        className="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/20 transition-colors"
      >
        Order
      </Link>
      <Link
        href="/barista"
        className="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/20 transition-colors"
      >
        Barista
      </Link>
      <Link
        href="/dashboard"
        className="px-3 py-2 rounded-md text-sm font-medium hover:bg-white/20 transition-colors"
      >
        Dashboard
      </Link>
    </div>
  );
}

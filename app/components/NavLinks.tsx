"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/",          label: "Order"     },
  { href: "/barista",   label: "Barista"   },
  { href: "/dashboard", label: "Dashboard" },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1">
      {NAV.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            pathname === href
              ? "bg-white/25 text-white"
              : "text-white/80 hover:bg-white/20 hover:text-white"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

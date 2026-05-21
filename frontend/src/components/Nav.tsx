"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/table",   label: "Spread Table" },
  { href: "/preview", label: "Preview" },
  { href: "/recap",   label: "Recap" },
  { href: "/chaos",   label: "Chaos Index" },
  // Delphi hidden until webhook + prompts are configured
];

export default function Nav() {
  const path = usePathname();

  return (
    <nav className="flex items-center gap-1 px-4 py-2 bg-gray-950 border-b border-gray-800 flex-shrink-0">
      <span className="text-red-500 font-bold mr-4 flex-shrink-0" style={{ fontSize: "15px", letterSpacing: "-0.01em" }}>
        Anfield Oracle
      </span>
      <div className="flex items-center gap-1 overflow-x-auto">
        {LINKS.map(({ href, label }) => {
          const active = path === href;
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? "bg-red-600 text-white"
                  : "text-gray-500 hover:text-white hover:bg-gray-800"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

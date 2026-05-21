"use client";

const LINKS = [
  { href: "#preview",    label: "Preview" },
  { href: "#soundboard", label: "Soundboard" },
  { href: "#table",      label: "Spread Table" },
  { href: "#chaos",      label: "Chaos Index" },
  { href: "#recap",      label: "Recap" },
];

export default function Nav() {
  return (
    <nav className="flex items-center gap-1 px-4 py-2 bg-gray-950 border-b border-gray-800 flex-shrink-0 sticky top-0 z-40">
      <span className="text-red-500 font-bold mr-4 flex-shrink-0" style={{ fontSize: "15px", letterSpacing: "-0.01em" }}>
        Anfield Oracle
      </span>
      <div className="flex items-center gap-1 overflow-x-auto">
        {LINKS.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            className="px-3 py-1 rounded text-xs font-semibold whitespace-nowrap transition-colors text-gray-500 hover:text-white hover:bg-gray-800"
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}

import Link from "next/link";

const PAGES = [
  { href: "/", label: "Review queue" },
  { href: "/batch", label: "Upload a batch" },
  { href: "/summary", label: "Daily summary" },
  { href: "/try", label: "Check one set" },
] as const;

/** The top navigation shared by every page; the current page is shown as text, not a link. */
export function Nav({ current }: { current: (typeof PAGES)[number]["href"] }) {
  return (
    <nav>
      <strong>AP Verify</strong>
      {PAGES.map((p) =>
        p.href === current ? (
          <span key={p.href} aria-current="page">
            {p.label}
          </span>
        ) : (
          <Link key={p.href} href={p.href}>
            {p.label}
          </Link>
        ),
      )}
    </nav>
  );
}

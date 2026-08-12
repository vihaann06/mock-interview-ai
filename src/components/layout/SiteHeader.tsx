import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="site-header">
      <Link href="/" className="brand-mark">
        Probe
      </Link>
      <nav className="site-nav" aria-label="Primary">
        <Link href="/companies">Companies</Link>
      </nav>
    </header>
  );
}

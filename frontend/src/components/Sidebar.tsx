'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Target,
  GitBranch,
  Search,
  Activity,
} from 'lucide-react';

const navLinks = [
  { href: '/', label: 'Reports', icon: FileText },
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/graph', label: 'Knowledge Graph', icon: GitBranch },
  { href: '/evidence', label: 'Evidence Explorer', icon: Search },
];

export default function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reportId = searchParams.get('id');

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Activity size={24} style={{ color: 'var(--accent-emerald)' }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
              SustainGraph
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
              MMKG-RAG Analytics
            </div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href ||
            (href !== '/' && pathname.startsWith(href));
          
          // Preserve the report ID in the URL if it exists (except for the Home/Reports page)
          const linkHref = (reportId && href !== '/') ? `${href}?id=${reportId}` : href;

          return (
            <Link
              key={href}
              href={linkHref}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-color)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          v0.1.0 — Research Prototype
        </div>
      </div>
    </aside>
  );
}

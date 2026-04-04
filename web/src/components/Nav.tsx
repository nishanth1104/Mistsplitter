'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ThemeToggle } from '@/components/ThemeToggle'

const NAV_ITEMS = [
  { href: '/',       label: 'Dashboard', icon: '▦' },
  { href: '/cases',  label: 'Cases',     icon: '⊞' },
  { href: '/audit',  label: 'Audit',     icon: '≡' },
  { href: '/agents', label: 'Agents',    icon: '◈' },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(href + '/')
}

export function Nav() {
  const pathname = usePathname()

  return (
    <nav className="w-56 min-h-screen bg-[hsl(var(--sidebar))] border-r border-[hsl(var(--sidebar-border))] flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="text-foreground font-bold text-sm tracking-widest uppercase">Mistsplitter</div>
        <div className="text-[hsl(var(--sidebar-muted))] text-xs mt-0.5">Fintech Operations</div>
      </div>

      {/* Links */}
      <div className="flex-1 py-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex items-center gap-3 px-5 py-2.5 text-sm transition-colors border-l-2',
                active
                  ? 'border-l-cyan-500 text-cyan-400 bg-cyan-500/10'
                  : 'border-l-transparent text-[hsl(var(--sidebar-muted))] hover:bg-[hsl(var(--sidebar-border))]/60 hover:text-[hsl(var(--sidebar-foreground))]',
              ].join(' ')}
            >
              <span className={active ? 'text-cyan-400' : 'text-[hsl(var(--sidebar-muted))]'}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-[hsl(var(--sidebar-border))] px-5 py-4 flex items-center justify-between">
        <div className="text-[hsl(var(--sidebar-muted))] text-xs">v0.0.1 · reviewer</div>
        <ThemeToggle />
      </div>
    </nav>
  )
}

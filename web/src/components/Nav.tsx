import Link from 'next/link'

const NAV_ITEMS = [
  { href: '/',        label: 'Dashboard',  icon: '▦' },
  { href: '/cases',   label: 'Cases',      icon: '⊞' },
  { href: '/audit',   label: 'Audit',      icon: '≡' },
  { href: '/agents',  label: 'Agents',     icon: '◈' },
]

export function Nav() {
  return (
    <nav className="w-56 min-h-screen bg-[#1a0f22] border-r border-[#462C55] flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-[#462C55]">
        <div className="text-[#A977BF] font-bold text-sm tracking-widest uppercase">Mistsplitter</div>
        <div className="text-[#704786] text-xs mt-0.5">Fintech Operations</div>
      </div>

      {/* Links */}
      <div className="flex-1 py-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-5 py-2.5 text-sm text-[#A977BF] hover:bg-[#2d1440] hover:text-[#E3C4E9] transition-colors"
          >
            <span className="text-[#704786] text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#462C55]">
        <div className="text-[#462C55] text-xs">v0.0.1 · reviewer</div>
      </div>
    </nav>
  )
}

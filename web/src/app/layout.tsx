import type { Metadata } from 'next'
import './globals.css'
import { Nav } from '@/components/Nav'

export const metadata: Metadata = {
  title: 'Mistsplitter — Fintech Operations',
  description: 'Governed AI orchestration platform for fintech operations',
  icons: {
    icon: '/favicon.png',
  },
  openGraph: {
    title: 'Mistsplitter',
    description: 'Governed AI orchestration platform for fintech operations',
    images: [{ url: '/favicon.png' }],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen bg-[#110918] text-[#E3C4E9]">
        <Nav />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </body>
    </html>
  )
}

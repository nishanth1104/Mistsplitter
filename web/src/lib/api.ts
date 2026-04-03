import { DEV_AUTH } from './auth'

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: DEV_AUTH,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`API ${path} → ${res.status}: ${body}`)
  }

  return res.json() as Promise<T>
}

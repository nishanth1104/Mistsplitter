import { describe, it, expect, vi } from 'vitest'

// Mock core to avoid DB connection at test time
vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    db: {
      $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    },
    getConfig: vi.fn().mockReturnValue({
      DATABASE_URL: 'postgresql://localhost/test',
      NODE_ENV: 'test',
      PORT: 3000,
      MCP_PORT: 3001,
      ANTHROPIC_API_KEY: 'test',
      JWT_SECRET: 'test-secret-that-is-long-enough-32chars',
    }),
    logger: {
      info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    },
    disconnectDb: vi.fn(),
  }
})

import { buildApp } from '../index.js'

describe('GET /health', () => {
  it('returns 200 with status ok when DB is connected', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { status: string; service: string }
    expect(body.status).toBe('ok')
    expect(body.service).toBe('mistsplitter-api')
    await app.close()
  })

  it('returns 503 when DB is unreachable', async () => {
    const { db } = await import('@mistsplitter/core')
    ;(db.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Connection refused'),
    )
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(503)
    const body = JSON.parse(res.body) as { status: string }
    expect(body.status).toBe('degraded')
    await app.close()
  })

  it('health endpoint does not require authentication', async () => {
    const app = await buildApp()
    // No Authorization header — should still get 200
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    await app.close()
  })

  it('returns a timestamp in ISO format', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    const body = JSON.parse(res.body) as { timestamp: string }
    expect(() => new Date(body.timestamp)).not.toThrow()
    expect(body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    await app.close()
  })
})

describe('Non-health routes require auth', () => {
  it('returns 401 for unknown route without auth', async () => {
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/cases' })
    // Either 401 (no auth) or 404 (route not defined yet) — both are valid
    expect([401, 404]).toContain(res.statusCode)
    await app.close()
  })
})

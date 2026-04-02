import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { authMiddleware, requireRole } from '../middleware/auth.js'

// Mock core logger
vi.mock('@mistsplitter/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mistsplitter/core')>()
  return {
    ...actual,
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  }
})

async function buildTestApp() {
  const app = Fastify({ logger: false })

  app.addHook('preHandler', authMiddleware)

  app.get('/me', async (request) => {
    return { user: request.user }
  })

  app.get('/reviewer-only', {
    preHandler: requireRole('reviewer'),
    handler: async () => ({ ok: true }),
  })

  app.get('/admin-only', {
    preHandler: requireRole('admin'),
    handler: async () => ({ ok: true }),
  })

  await app.ready()
  return app
}

describe('authMiddleware', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const app = await buildTestApp()
    const res = await app.inject({ method: 'GET', url: '/me' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when token format is invalid', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer invalid' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for unknown role', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer superuser:user_1:Alice' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('sets request.user for valid token', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: 'Bearer reviewer:user_123:Jane Smith' },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { user: { id: string; role: string; name: string } }
    expect(body.user.role).toBe('reviewer')
    expect(body.user.id).toBe('user_123')
    expect(body.user.name).toBe('Jane Smith')
  })

  it('handles all 6 valid roles', async () => {
    const app = await buildTestApp()
    const roles = ['analyst', 'reviewer', 'manager', 'admin', 'platform-engineer', 'workflow-agent']
    for (const role of roles) {
      const res = await app.inject({
        method: 'GET',
        url: '/me',
        headers: { authorization: `Bearer ${role}:user_1:Test` },
      })
      expect(res.statusCode).toBe(200)
    }
  })
})

describe('requireRole()', () => {
  it('allows reviewer to access reviewer-only route', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/reviewer-only',
      headers: { authorization: 'Bearer reviewer:user_1:Jane' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('allows higher role (admin) to access reviewer-only route', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/reviewer-only',
      headers: { authorization: 'Bearer admin:user_1:Admin' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('returns 403 when analyst tries to access reviewer-only route', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/reviewer-only',
      headers: { authorization: 'Bearer analyst:user_1:Alice' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('returns 403 when reviewer tries to access admin-only route', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: 'Bearer reviewer:user_1:Jane' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('allows admin to access admin-only route', async () => {
    const app = await buildTestApp()
    const res = await app.inject({
      method: 'GET',
      url: '/admin-only',
      headers: { authorization: 'Bearer admin:admin_1:Admin' },
    })
    expect(res.statusCode).toBe(200)
  })
})

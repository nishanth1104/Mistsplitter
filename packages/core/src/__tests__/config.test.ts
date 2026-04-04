import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const REQUIRED_VALID = {
  DATABASE_URL: 'postgresql://localhost/test',
  OPENAI_API_KEY: 'sk-proj-test-key',
  JWT_SECRET: 'a-very-long-secret-that-is-at-least-32-characters-long',
}

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) {
      delete process.env[k]
    } else {
      process.env[k] = v
    }
  }
}

function saveEnv(keys: string[]): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {}
  for (const k of keys) {
    saved[k] = process.env[k]
  }
  return saved
}

describe('config loader', () => {
  const keys = ['DATABASE_URL', 'OPENAI_API_KEY', 'PORT', 'MCP_PORT', 'NODE_ENV', 'JWT_SECRET']
  let saved: Record<string, string | undefined>

  beforeEach(async () => {
    saved = saveEnv(keys)
    // Reset config singleton before each test
    const { resetConfig } = await import('../config.js')
    resetConfig()
  })

  afterEach(async () => {
    setEnv(saved)
    const { resetConfig } = await import('../config.js')
    resetConfig()
  })

  it('throws with descriptive error when DATABASE_URL is missing', async () => {
    setEnv({ ...REQUIRED_VALID, DATABASE_URL: undefined })
    const { getConfig, resetConfig } = await import('../config.js')
    resetConfig()
    expect(() => getConfig()).toThrow('Invalid configuration')
  })

  it('throws when OPENAI_API_KEY is missing', async () => {
    setEnv({ ...REQUIRED_VALID, OPENAI_API_KEY: undefined })
    const { getConfig, resetConfig } = await import('../config.js')
    resetConfig()
    expect(() => getConfig()).toThrow('Invalid configuration')
  })

  it('loads valid config successfully', async () => {
    setEnv({ ...REQUIRED_VALID, PORT: '4000', MCP_PORT: '4001', NODE_ENV: 'test' })
    const { getConfig, resetConfig } = await import('../config.js')
    resetConfig()
    const config = getConfig()
    expect(config.PORT).toBe(4000)
    expect(config.MCP_PORT).toBe(4001)
    expect(config.NODE_ENV).toBe('test')
  })

  it('uses default PORT of 3000 when not set', async () => {
    setEnv({ ...REQUIRED_VALID, PORT: undefined, NODE_ENV: 'test' })
    const { getConfig, resetConfig } = await import('../config.js')
    resetConfig()
    const config = getConfig()
    expect(config.PORT).toBe(3000)
  })

  it('returns the same singleton on repeated calls', async () => {
    setEnv({ ...REQUIRED_VALID, NODE_ENV: 'test' })
    const { getConfig, resetConfig } = await import('../config.js')
    resetConfig()
    const a = getConfig()
    const b = getConfig()
    expect(a).toBe(b)
  })

  it('loads signal threshold defaults', async () => {
    setEnv({ ...REQUIRED_VALID, NODE_ENV: 'test' })
    const { getConfig, resetConfig } = await import('../config.js')
    resetConfig()
    const config = getConfig()
    expect(config.HIGH_AMOUNT_THRESHOLD).toBe(10000)
    expect(config.RAPID_SUCCESSION_COUNT).toBe(3)
    expect(config.AMOUNT_DEVIATION_MULTIPLIER).toBe(2)
  })
})

import { z } from 'zod'

const ConfigSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid PostgreSQL connection string'),
  NODE_ENV: z.enum(['development', 'test', 'demo', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MCP_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').default('dev-secret-change-in-production-min-32-chars'),
})

export type Config = z.infer<typeof ConfigSchema>

function loadConfig(): Config {
  const result = ConfigSchema.safeParse(process.env)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid configuration:\n${issues}`)
  }
  return result.data
}

// Singleton config instance — validated at startup
let _config: Config | null = null

export function getConfig(): Config {
  if (!_config) {
    _config = loadConfig()
  }
  return _config
}

// For testing — reset the singleton
export function resetConfig(): void {
  _config = null
}

import pino from 'pino'

// Secret field names that must never appear in logs
const SECRET_FIELDS = new Set([
  'password',
  'apiKey',
  'api_key',
  'token',
  'secret',
  'authorization',
  'access_token',
  'refresh_token',
  'private_key',
  'jwt',
  'credential',
  'credentials',
])

/**
 * Recursively redact known secret fields from a log object.
 * Operates on a shallow copy — does not mutate original.
 */
function redactSecrets(obj: unknown, depth = 0): unknown {
  if (depth > 10) return obj // prevent infinite recursion
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map((item) => redactSecrets(item, depth + 1))
  }
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SECRET_FIELDS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]'
    } else {
      result[key] = redactSecrets(value, depth + 1)
    }
  }
  return result
}

const baseLogger = pino({
  level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label }
    },
    log(obj) {
      return redactSecrets(obj) as object
    },
  },
  base: {
    service: 'mistsplitter',
    env: process.env['NODE_ENV'] ?? 'development',
  },
})

export const logger = baseLogger

export type Logger = typeof baseLogger

/**
 * Create a child logger with fixed context fields.
 */
export function childLogger(context: Record<string, unknown>): Logger {
  return baseLogger.child(context) as Logger
}

/**
 * Exported for unit testing — strips secrets from an arbitrary object.
 */
export { redactSecrets }

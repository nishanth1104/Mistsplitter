import { PrismaClient } from '@prisma/client'

// Singleton pattern — one connection pool per process
let _client: PrismaClient | null = null

export function getDb(): PrismaClient {
  if (!_client) {
    _client = new PrismaClient({
      log:
        process.env['NODE_ENV'] === 'development'
          ? ['error', 'warn']
          : ['error'],
    })
  }
  return _client
}

/**
 * Disconnect from the database. Call on process exit.
 */
export async function disconnectDb(): Promise<void> {
  if (_client) {
    await _client.$disconnect()
    _client = null
  }
}

// Export a default instance for convenience
export const db = getDb()

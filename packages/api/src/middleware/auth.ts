import type { FastifyRequest, FastifyReply } from 'fastify'
import { logger, type ActorRole } from '@mistsplitter/core'
import { PermissionDeniedError } from '@mistsplitter/core'
import { writeAuditEvent } from '@mistsplitter/audit'

// Role hierarchy — higher index = more permissions
const ROLE_HIERARCHY: ActorRole[] = [
  'analyst',
  'reviewer',
  'manager',
  'admin',
  'platform-engineer',
  'workflow-agent',
]

export interface AuthenticatedUser {
  id: string
  role: ActorRole
  name: string
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser
  }
}

/**
 * Extract and validate the Authorization header.
 * In production, this would verify a JWT. In dev, we parse a simple header.
 *
 * Format: Authorization: Bearer <role>:<user_id>:<name>
 * Example: Authorization: Bearer reviewer:user_123:Jane Smith
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers['authorization']
  const ip = request.ip

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn({ ip, url: request.url }, 'Auth failed — missing or invalid authorization header')
    await writeAuthFailedEvent(request, 'missing_header')
    await reply.status(401).send({
      error: 'Missing or invalid authorization header',
      code: 'UNAUTHORIZED',
    })
    return
  }

  const token = authHeader.slice(7) // Remove 'Bearer '
  const parts = token.split(':')

  if (parts.length < 3) {
    logger.warn({ ip, url: request.url }, 'Auth failed — invalid token format')
    await writeAuthFailedEvent(request, 'invalid_token_format')
    await reply.status(401).send({
      error: 'Invalid token format',
      code: 'UNAUTHORIZED',
    })
    return
  }

  const [role, id, ...nameParts] = parts
  const name = nameParts.join(':')

  if (!isValidRole(role)) {
    logger.warn({ ip, url: request.url, attemptedRole: role }, 'Auth failed — invalid role')
    await writeAuthFailedEvent(request, `invalid_role:${role}`)
    await reply.status(401).send({
      error: `Invalid role: ${role}`,
      code: 'UNAUTHORIZED',
    })
    return
  }

  request.user = { id: id ?? 'unknown', role, name: name || 'Unknown User' }
}

/**
 * Factory: create a middleware that requires a minimum role.
 */
export function requireRole(minimumRole: ActorRole) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = request.user

    if (!user) {
      await reply.status(401).send({ error: 'Unauthenticated', code: 'UNAUTHORIZED' })
      return
    }

    if (!hasMinimumRole(user.role, minimumRole)) {
      logger.warn(
        { userId: user.id, userRole: user.role, requiredRole: minimumRole, url: request.url },
        'Access denied — insufficient role',
      )
      await reply.status(403).send({
        error: new PermissionDeniedError(user.role, `role:${minimumRole}`).message,
        code: 'FORBIDDEN',
      })
      return
    }
  }
}

function isValidRole(value: unknown): value is ActorRole {
  return (
    typeof value === 'string' &&
    ROLE_HIERARCHY.includes(value as ActorRole)
  )
}

function hasMinimumRole(userRole: ActorRole, requiredRole: ActorRole): boolean {
  const userIndex = ROLE_HIERARCHY.indexOf(userRole)
  const requiredIndex = ROLE_HIERARCHY.indexOf(requiredRole)
  return userIndex >= requiredIndex
}

/**
 * Write an auth.failed audit event — no token/credential content, only metadata.
 */
async function writeAuthFailedEvent(request: FastifyRequest, reason: string): Promise<void> {
  try {
    await writeAuditEvent({
      actorType: 'api',
      actorId: request.ip,
      actorRole: 'analyst', // lowest role — unknown at this point
      action: 'auth.failed',
      payload: {
        reason,
        url: request.url,
        method: request.method,
        ip: request.ip,
      },
    })
  } catch {
    // Never let audit logging break the auth response
  }
}

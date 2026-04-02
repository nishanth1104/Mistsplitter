import type { FastifyError, FastifyRequest, FastifyReply } from 'fastify'
import { logger } from '@mistsplitter/core'

/**
 * Global error handler.
 * NEVER expose stack traces, DB schema details, or internal state to clients.
 * All errors are logged internally with full context.
 */
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  const correlationId = request.headers['x-correlation-id']

  // Log the full error internally
  logger.error(
    {
      err: error,
      url: request.url,
      method: request.method,
      correlationId,
      userId: request.user?.id,
    },
    'Request error',
  )

  // Validation errors (from Fastify schema validation)
  if (error.statusCode === 400) {
    void reply.status(400).send({
      error: error.message,
      code: 'VALIDATION_ERROR',
    })
    return
  }

  // Body too large
  if (error.statusCode === 413) {
    void reply.status(413).send({
      error: 'Request body too large',
      code: 'PAYLOAD_TOO_LARGE',
    })
    return
  }

  // Known status codes — pass through with safe message
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    void reply.status(error.statusCode).send({
      error: error.message,
      code: error.code ?? 'CLIENT_ERROR',
    })
    return
  }

  // All 5xx — return generic message, never the real error
  void reply.status(500).send({
    error: 'An internal error occurred',
    code: 'INTERNAL_ERROR',
  })
}

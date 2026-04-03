import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db, ids, logger } from '@mistsplitter/core'
import { startWorkflowRun, executeWorkflow, RISK_REVIEW_STEPS, buildExecutors } from '@mistsplitter/workflow'
import { requireRole } from '../middleware/auth.js'

const CaseParamsSchema = z.object({ id: z.string().min(1) }).strict()

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  // POST /cases/:id/run — start a workflow run for a case (async)
  app.post(
    '/:id/run',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const parsedParams = CaseParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'Invalid path parameters', details: parsedParams.error.flatten() })
      }
      const { id: caseId } = parsedParams.data
      const correlationId =
        (request.headers['x-correlation-id'] as string | undefined) ?? `req_${Date.now()}`

      // Verify case exists
      const caseRecord = await db.case.findUnique({ where: { caseId } })
      if (!caseRecord) {
        return reply.status(404).send({ error: 'Case not found', code: 'NOT_FOUND' })
      }

      // Start the workflow run
      const runResult = await startWorkflowRun(caseId, correlationId)
      if (!runResult.ok) {
        if (runResult.error.code === 'WORKFLOW_ALREADY_RUNNING') {
          return reply.status(409).send({ error: runResult.error.message, code: 'CONFLICT' })
        }
        return reply.status(500).send({ error: runResult.error.message, code: 'INTERNAL_ERROR' })
      }

      const run = runResult.value

      // Execute the workflow asynchronously (don't await — return immediately)
      const executors = buildExecutors(caseId, run.runId)
      executeWorkflow(run, RISK_REVIEW_STEPS, executors, correlationId).catch((err: unknown) => {
        logger.error({ err, caseId, runId: run.runId }, 'Async workflow execution error')
      })

      return reply
        .header('X-Correlation-Id', correlationId)
        .status(202)
        .send({
          runId: run.runId,
          caseId,
          status: 'running',
          message: 'Workflow started. Use GET /cases/:id to poll for status.',
        })
    },
  )

  // GET /cases/:id/runs — list workflow runs for a case
  app.get(
    '/:id/runs',
    { preHandler: requireRole('analyst') },
    async (request, reply) => {
      const parsedParams = CaseParamsSchema.safeParse(request.params)
      if (!parsedParams.success) {
        return reply.code(400).send({ error: 'Invalid path parameters', details: parsedParams.error.flatten() })
      }
      const { id: caseId } = parsedParams.data

      const runs = await db.workflowRun.findMany({
        where: { caseId },
        orderBy: { startedAt: 'desc' },
      })

      return reply.send({ runs, total: runs.length })
    },
  )
}

/**
 * RetrievalAgent executor — fetches contextual records and writes evidence rows.
 * Runs in the `retrieving` workflow state.
 */

import { db, ids, type EvidenceType } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { StepResult } from '../types.js'

export async function runRetrievalAgent(caseId: string, runId: string): Promise<StepResult> {
  try {
    // Fetch case → alert → transaction → account → customer + merchant
    const caseRecord = await db.case.findUnique({
      where: { caseId },
      include: {
        alert: {
          include: {
            transaction: {
              include: {
                account: { include: { customer: true } },
                merchant: true,
              },
            },
          },
        },
      },
    })

    if (!caseRecord?.alert?.transaction) {
      return { success: false, error: `Cannot retrieve context: missing transaction for case ${caseId}` }
    }

    const txn = caseRecord.alert.transaction
    const account = txn.account
    const customer = account?.customer
    const merchant = txn.merchant
    const correlationId = caseRecord.correlationId ?? undefined

    const evidenceRows: { evidenceType: EvidenceType; payloadJson: object }[] = []

    // 1. Customer profile
    if (customer) {
      evidenceRows.push({
        evidenceType: 'customer_profile',
        payloadJson: {
          customerId: customer.customerId,
          customerType: customer.customerType,
          name: customer.name,
          country: customer.country,
          riskTier: customer.riskTier,
        },
      })
    }

    // 2. Account context
    if (account) {
      evidenceRows.push({
        evidenceType: 'account_context',
        payloadJson: {
          accountId: account.accountId,
          customerId: account.customerId,
          status: account.status,
          openedAt: account.openedAt,
        },
      })
    }

    // 3. Transaction history (last 10 for this account)
    const recentTxns = account
      ? await db.transaction.findMany({
          where: { accountId: account.accountId },
          orderBy: { timestamp: 'desc' },
          take: 10,
          select: {
            transactionId: true,
            amount: true,
            currency: true,
            channel: true,
            timestamp: true,
            status: true,
            merchantId: true,
          },
        })
      : []

    evidenceRows.push({
      evidenceType: 'transaction_history',
      payloadJson: {
        accountId: account?.accountId,
        transactions: recentTxns,
        count: recentTxns.length,
      },
    })

    // 4. Merchant context
    if (merchant) {
      evidenceRows.push({
        evidenceType: 'merchant_context',
        payloadJson: {
          merchantId: merchant.merchantId,
          name: merchant.name,
          category: merchant.category,
          country: merchant.country,
          riskTag: merchant.riskTag,
        },
      })
    }

    // 5. Prior alerts (last 5 for this account's transactions)
    const priorAlerts = account
      ? await db.alert.findMany({
          where: {
            transaction: { accountId: account.accountId },
            alertId: { not: caseRecord.alert.alertId },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            alertId: true,
            alertType: true,
            severity: true,
            createdAt: true,
          },
        })
      : []

    evidenceRows.push({
      evidenceType: 'prior_alerts',
      payloadJson: {
        accountId: account?.accountId,
        priorAlerts,
        count: priorAlerts.length,
      },
    })

    // Write all evidence rows
    await db.caseEvidence.createMany({
      data: evidenceRows.map((row) => ({
        evidenceId: ids.evidence(),
        caseId,
        evidenceType: row.evidenceType,
        payloadJson: row.payloadJson,
      })),
    })

    await writeAuditEvent({
      caseId,
      actorType: 'agent',
      actorId: 'RetrievalAgent',
      actorRole: 'workflow-agent',
      action: AuditActions.AGENT_COMPLETED,
      payload: {
        step: 'retrieval',
        runId,
        evidenceTypesWritten: evidenceRows.map((r) => r.evidenceType),
        priorAlertsCount: priorAlerts.length,
        recentTxnsCount: recentTxns.length,
      },
      correlationId,
    })

    return {
      success: true,
      data: { evidenceCount: evidenceRows.length },
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { success: false, error: `RetrievalAgent failed: ${message}` }
  }
}

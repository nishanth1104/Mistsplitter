/**
 * SignalAgent executor — computes risk signals from retrieved evidence.
 * Runs in the `computing_signals` workflow state.
 */

import { db, ids } from '@mistsplitter/core'
import { writeAuditEvent, AuditActions } from '@mistsplitter/audit'
import type { StepResult } from '../types.js'

interface TransactionRecord {
  transactionId: string
  amount: string
  currency: string
  channel: string
  timestamp: string | Date
  status: string
}

interface Signal {
  signalName: string
  signalValue: string
  signalReason: string
}

export async function runSignalAgent(caseId: string, runId: string): Promise<StepResult> {
  try {
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
      return { success: false, error: `Missing transaction data for case ${caseId}` }
    }

    const txn = caseRecord.alert.transaction
    const customer = txn.account?.customer
    const merchant = txn.merchant
    const correlationId = caseRecord.correlationId ?? undefined

    // Fetch evidence for transaction history and prior alerts
    const txnHistoryEvidence = await db.caseEvidence.findFirst({
      where: { caseId, evidenceType: 'transaction_history' },
    })
    const priorAlertsEvidence = await db.caseEvidence.findFirst({
      where: { caseId, evidenceType: 'prior_alerts' },
    })

    const txnPayload = txnHistoryEvidence?.payloadJson as { transactions?: TransactionRecord[] } | null
    const recentTxns: TransactionRecord[] = txnPayload?.transactions ?? []

    const priorAlertsPayload = priorAlertsEvidence?.payloadJson as { count?: number } | null
    const priorAlertsCount = priorAlertsPayload?.count ?? 0

    const signals: Signal[] = []
    const txnAmount = parseFloat(String(txn.amount))

    // Signal 1: High amount
    if (txnAmount > 10000) {
      signals.push({
        signalName: 'high_amount',
        signalValue: String(txnAmount),
        signalReason: `Transaction amount ${txnAmount} exceeds threshold of 10,000`,
      })
    }

    // Signal 2: PEP customer
    if (customer?.riskTier === 'pep') {
      signals.push({
        signalName: 'pep_customer',
        signalValue: 'true',
        signalReason: `Customer ${customer.customerId} is classified as Politically Exposed Person`,
      })
    }

    // Signal 3: Rapid succession (>3 transactions in 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const recentCount = recentTxns.filter(
      (t) => new Date(t.timestamp) > oneDayAgo,
    ).length
    if (recentCount > 3) {
      signals.push({
        signalName: 'rapid_succession',
        signalValue: String(recentCount),
        signalReason: `${recentCount} transactions in last 24 hours (threshold: 3)`,
      })
    }

    // Signal 4: Unusual merchant category
    if (merchant?.riskTag === 'restricted') {
      signals.push({
        signalName: 'unusual_merchant_category',
        signalValue: merchant.riskTag,
        signalReason: `Merchant ${merchant.merchantId} has restricted risk tag`,
      })
    }

    // Signal 5: Prior alert history
    if (priorAlertsCount > 0) {
      signals.push({
        signalName: 'prior_alert_history',
        signalValue: String(priorAlertsCount),
        signalReason: `${priorAlertsCount} prior alert(s) on this account`,
      })
    }

    // Signal 6: Amount deviation (compare to account average)
    if (recentTxns.length > 1) {
      const amounts = recentTxns.map((t) => parseFloat(String(t.amount))).filter((a) => !isNaN(a))
      if (amounts.length > 0) {
        const avg = amounts.reduce((s, a) => s + a, 0) / amounts.length
        const deviation = avg > 0 ? Math.abs(txnAmount - avg) / avg : 0
        if (deviation > 2) {
          signals.push({
            signalName: 'amount_deviation',
            signalValue: deviation.toFixed(2),
            signalReason: `Transaction amount deviates ${(deviation * 100).toFixed(0)}% from account average of ${avg.toFixed(2)}`,
          })
        }
      }
    }

    // Signal 7: Cross-border (non-USD)
    if (txn.currency !== 'USD') {
      signals.push({
        signalName: 'cross_border',
        signalValue: txn.currency,
        signalReason: `Transaction currency ${txn.currency} indicates potential cross-border activity`,
      })
    }

    // Write signals to DB
    if (signals.length > 0) {
      await db.riskSignal.createMany({
        data: signals.map((s) => ({
          signalId: ids.signal(),
          caseId,
          signalName: s.signalName,
          signalValue: s.signalValue,
          signalReason: s.signalReason,
        })),
      })
    }

    await writeAuditEvent({
      caseId,
      actorType: 'agent',
      actorId: 'SignalAgent',
      actorRole: 'workflow-agent',
      action: AuditActions.AGENT_COMPLETED,
      payload: {
        step: 'signal',
        runId,
        signalsComputed: signals.length,
        signalNames: signals.map((s) => s.signalName),
      },
      correlationId,
    })

    return {
      success: true,
      data: { signalCount: signals.length, signals: signals.map((s) => s.signalName) },
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return { success: false, error: `SignalAgent failed: ${message}` }
  }
}

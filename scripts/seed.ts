/**
 * Seed script for Mistsplitter.
 * Populates the database with realistic synthetic fintech data.
 *
 * Seeding order (respects FK dependencies):
 * 1. merchants
 * 2. customers
 * 3. accounts
 * 4. transactions
 * 5. alerts
 * 6. cases
 * 7. risk_signals, case_evidence, recommendations
 * 8. reviews
 * 9. agent_registry
 * 10. audit_logs (derived from above)
 */

import { PrismaClient } from '@prisma/client'
import { ulid } from 'ulid'

const db = new PrismaClient()

function id(prefix: string): string {
  return `${prefix}_${ulid()}`
}

const MCC_CODES = ['5411', '5812', '4814', '7011', '6011', '5999', '7372', '4215']
const COUNTRIES = ['US', 'GB', 'DE', 'SG', 'AE', 'MX', 'BR', 'IN', 'CN', 'NG']
const CURRENCIES = ['USD', 'EUR', 'GBP', 'SGD', 'AED']

function randomItem<T>(arr: T[]): T {
  const idx = Math.floor(Math.random() * arr.length)
  return arr[idx] as T
}

function randomAmount(min: number, max: number): string {
  return (min + Math.random() * (max - min)).toFixed(2)
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

async function seedMerchants() {
  const merchants = []
  const riskTags = ['standard', 'standard', 'standard', 'elevated', 'elevated', 'restricted'] as const

  for (let i = 0; i < 60; i++) {
    merchants.push({
      merchantId: id('merchant'),
      name: `Merchant ${i + 1}`,
      category: randomItem(MCC_CODES),
      country: randomItem(COUNTRIES),
      riskTag: randomItem(riskTags),
    })
  }

  await db.merchant.createMany({ data: merchants, skipDuplicates: true })
  console.log(`Seeded ${merchants.length} merchants`)
  return merchants
}

async function seedCustomers() {
  const customers = []
  const types = ['individual', 'individual', 'individual', 'business'] as const
  const riskTiers = ['low', 'low', 'medium', 'high', 'pep'] as const

  for (let i = 0; i < 300; i++) {
    customers.push({
      customerId: id('customer'),
      customerType: randomItem(types),
      name: `Customer ${i + 1}`,
      country: randomItem(COUNTRIES),
      riskTier: randomItem(riskTiers),
    })
  }

  await db.customer.createMany({ data: customers, skipDuplicates: true })
  console.log(`Seeded ${customers.length} customers`)
  return customers
}

async function seedAccounts(customers: Array<{ customerId: string }>) {
  const accounts = []
  const statuses = ['active', 'active', 'active', 'suspended', 'closed'] as const

  for (const customer of customers) {
    const numAccounts = 1 + Math.floor(Math.random() * 2)
    for (let j = 0; j < numAccounts; j++) {
      accounts.push({
        accountId: id('account'),
        customerId: customer.customerId,
        status: randomItem(statuses),
        openedAt: daysAgo(365 + Math.floor(Math.random() * 1460)),
      })
    }
  }

  await db.account.createMany({ data: accounts, skipDuplicates: true })
  console.log(`Seeded ${accounts.length} accounts`)
  return accounts
}

async function seedTransactions(
  accounts: Array<{ accountId: string }>,
  merchants: Array<{ merchantId: string }>,
) {
  const transactions = []
  const channels = ['card', 'wire', 'ach', 'cash', 'crypto'] as const
  const statuses = ['completed', 'completed', 'completed', 'pending', 'reversed', 'flagged'] as const

  // Only seed for first 100 accounts to keep it manageable
  const sampleAccounts = accounts.slice(0, 100)

  for (const account of sampleAccounts) {
    const numTxns = 10 + Math.floor(Math.random() * 40)
    for (let j = 0; j < numTxns; j++) {
      transactions.push({
        transactionId: id('txn'),
        accountId: account.accountId,
        merchantId: Math.random() > 0.1 ? randomItem(merchants).merchantId : null,
        amount: randomAmount(10, 50000),
        currency: randomItem(CURRENCIES),
        channel: randomItem(channels),
        timestamp: daysAgo(Math.floor(Math.random() * 90)),
        status: randomItem(statuses),
      })
    }
  }

  await db.transaction.createMany({ data: transactions, skipDuplicates: true })
  console.log(`Seeded ${transactions.length} transactions`)
  return transactions
}

async function seedAlerts(transactions: Array<{ transactionId: string }>) {
  const alerts = []
  const alertTypes = ['amount_threshold', 'velocity', 'pattern', 'merchant_risk', 'rule_hit'] as const
  const severities = ['low', 'medium', 'high', 'critical'] as const

  // Create alerts for ~20% of transactions
  const alertableTxns = transactions.filter(() => Math.random() < 0.2)

  for (const txn of alertableTxns.slice(0, 60)) {
    alerts.push({
      alertId: id('alert'),
      transactionId: txn.transactionId,
      alertType: randomItem(alertTypes),
      severity: randomItem(severities),
    })
  }

  await db.alert.createMany({ data: alerts, skipDuplicates: true })
  console.log(`Seeded ${alerts.length} alerts`)
  return alerts
}

async function seedCases(alerts: Array<{ alertId: string; severity: string }>) {
  const cases = []
  const priorities = ['low', 'medium', 'high', 'critical'] as const
  const statuses = ['pending', 'in_review', 'escalated', 'closed_clear', 'closed_actioned'] as const

  // Ensure at least 3 in each status
  const statusPool = [
    ...Array(4).fill('pending'),
    ...Array(4).fill('in_review'),
    ...Array(4).fill('escalated'),
    ...Array(4).fill('closed_clear'),
    ...Array(4).fill('closed_actioned'),
  ] as const

  for (let i = 0; i < Math.min(alerts.length, 30); i++) {
    const alert = alerts[i]!
    const status = i < statusPool.length ? statusPool[i]! : randomItem(statuses)
    const severityToPriority: Record<string, typeof priorities[number]> = {
      low: 'low',
      medium: 'medium',
      high: 'high',
      critical: 'critical',
    }

    cases.push({
      caseId: id('case'),
      alertId: alert.alertId,
      status: status,
      priority: severityToPriority[alert.severity] ?? 'medium',
      assignedTo: Math.random() > 0.3 ? `reviewer_${Math.floor(Math.random() * 5) + 1}` : null,
      correlationId: id('corr'),
    })
  }

  await db.case.createMany({ data: cases, skipDuplicates: true })
  console.log(`Seeded ${cases.length} cases`)
  return cases
}

async function seedAgentRegistry() {
  const agents = [
    {
      agentId: id('agent'),
      name: 'IntakeAgent',
      owner: 'platform',
      role: 'intake',
      status: 'active' as const,
      approvedTools: ['create_case', 'validate_alert'],
      allowedActions: ['case.create'],
      riskLevel: 'low' as const,
    },
    {
      agentId: id('agent'),
      name: 'RetrievalAgent',
      owner: 'platform',
      role: 'retrieval',
      status: 'active' as const,
      approvedTools: [
        'get_customer_profile',
        'get_account_context',
        'get_merchant_context',
        'get_recent_transactions',
        'get_prior_alerts',
        'get_prior_reviews',
      ],
      allowedActions: ['evidence.write'],
      riskLevel: 'low' as const,
    },
    {
      agentId: id('agent'),
      name: 'SignalAgent',
      owner: 'platform',
      role: 'signal_computation',
      status: 'active' as const,
      approvedTools: ['compute_rule_hits', 'compute_risk_signals'],
      allowedActions: ['signal.write'],
      riskLevel: 'medium' as const,
    },
    {
      agentId: id('agent'),
      name: 'EvidenceAgent',
      owner: 'platform',
      role: 'evidence_assembly',
      status: 'active' as const,
      approvedTools: ['build_evidence_bundle'],
      allowedActions: ['evidence.bundle'],
      riskLevel: 'low' as const,
    },
    {
      agentId: id('agent'),
      name: 'SummaryAgent',
      owner: 'platform',
      role: 'summary_generation',
      status: 'active' as const,
      approvedTools: ['draft_case_summary'],
      allowedActions: ['recommendation.write'],
      riskLevel: 'high' as const,
    },
    {
      agentId: id('agent'),
      name: 'PolicyAgent',
      owner: 'platform',
      role: 'policy_evaluation',
      status: 'active' as const,
      approvedTools: ['check_policy'],
      allowedActions: ['policy.evaluate'],
      riskLevel: 'medium' as const,
    },
    {
      agentId: id('agent'),
      name: 'ReviewLoggerAgent',
      owner: 'platform',
      role: 'review_logging',
      status: 'active' as const,
      approvedTools: ['submit_review_record', 'write_audit_event', 'update_metrics'],
      allowedActions: ['review.persist', 'metrics.update', 'audit.write'],
      riskLevel: 'medium' as const,
    },
  ]

  for (const agent of agents) {
    await db.agentRegistry.upsert({
      where: { name: agent.name },
      update: {},
      create: agent,
    })
  }

  console.log(`Seeded ${agents.length} agent registry entries`)
  return agents
}

async function seedMetricsSnapshots() {
  const metrics = [
    { metricName: 'queue_backlog', metricValue: '12' },
    { metricName: 'override_rate', metricValue: '0.15' },
    { metricName: 'avg_review_time_seconds', metricValue: '245' },
    { metricName: 'escalation_rate', metricValue: '0.08' },
    { metricName: 'acceptance_rate', metricValue: '0.77' },
  ]

  await db.metricsSnapshot.createMany({
    data: metrics.map((m) => ({
      snapshotId: id('metric'),
      ...m,
    })),
    skipDuplicates: true,
  })

  console.log(`Seeded ${metrics.length} metrics snapshots`)
}

async function main() {
  console.log('Starting Mistsplitter seed...\n')

  try {
    const merchants = await seedMerchants()
    const customers = await seedCustomers()
    const accounts = await seedAccounts(customers)
    const transactions = await seedTransactions(accounts, merchants)
    const alerts = await seedAlerts(transactions)
    await seedCases(alerts)
    await seedAgentRegistry()
    await seedMetricsSnapshots()

    console.log('\n✓ Seed complete')
  } catch (err) {
    console.error('Seed failed:', err)
    process.exit(1)
  } finally {
    await db.$disconnect()
  }
}

main()

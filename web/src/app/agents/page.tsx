import { apiFetch } from '@/lib/api'
import type { AgentListResponse, AgentStatus } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

const STATUS_STYLES: Record<AgentStatus, string> = {
  active:    'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/20',
  suspended: 'bg-amber-500/20  text-amber-300   border-amber-500/40   hover:bg-amber-500/20',
  revoked:   'bg-rose-500/20   text-rose-300    border-rose-500/40    hover:bg-rose-500/20',
}

const RISK_STYLES: Record<string, string> = {
  low:    'text-emerald-400',
  medium: 'text-amber-400',
  high:   'text-rose-400',
}

export default async function AgentsPage() {
  const data = await apiFetch<AgentListResponse>('/agents').catch(() => ({ agents: [], total: 0 }))

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Agent Registry</h1>
        <p className="text-muted-foreground text-sm mt-1">{data.total} registered agents</p>
      </div>

      <div className="space-y-3">
        {data.agents.map((agent) => (
          <details key={agent.agentId} className="bg-card border border-border rounded-lg group">
            <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-accent/50 transition-colors rounded-lg list-none">
              <div className="flex-1 flex items-center gap-4">
                <span className="text-foreground font-semibold">{agent.name}</span>
                <span className="text-muted-foreground text-xs font-mono">{agent.role}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${RISK_STYLES[agent.riskLevel] ?? 'text-muted-foreground'}`}>
                  {agent.riskLevel} risk
                </span>
                <span className="text-muted-foreground text-xs">{agent.approvedTools.length} tools</span>
                <Badge variant="outline" className={STATUS_STYLES[agent.status] ?? STATUS_STYLES.revoked}>
                  {agent.status}
                </Badge>
                <span className="text-muted-foreground text-xs ml-2 group-open:hidden">▸</span>
                <span className="text-muted-foreground text-xs ml-2 hidden group-open:inline">▾</span>
              </div>
            </summary>

            <div className="px-5 pb-5 border-t border-border pt-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">
                    Approved Tools ({agent.approvedTools.length})
                  </div>
                  <div className="space-y-1">
                    {agent.approvedTools.map((t) => (
                      <div key={t} className="text-cyan-400 text-xs px-2 py-1 bg-background rounded font-mono border border-border/50">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs font-medium uppercase tracking-wide mb-2">
                    Allowed Actions ({agent.allowedActions.length})
                  </div>
                  <div className="space-y-1">
                    {agent.allowedActions.map((a) => (
                      <div key={a} className="text-muted-foreground text-xs px-2 py-1 bg-background rounded font-mono border border-border/50">
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 text-muted-foreground/50 text-xs font-mono">
                ID: {agent.agentId} · Created {new Date(agent.createdAt).toLocaleDateString()}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

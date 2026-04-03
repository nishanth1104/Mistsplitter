import { apiFetch } from '@/lib/api'
import type { AgentListResponse, AgentStatus } from '@/lib/types'

const STATUS_STYLES: Record<AgentStatus, string> = {
  active:    'bg-green-900 text-green-300 ring-green-600',
  suspended: 'bg-yellow-900 text-yellow-300 ring-yellow-600',
  revoked:   'bg-red-900 text-red-300 ring-red-700',
}

const RISK_STYLES: Record<string, string> = {
  low:    'text-green-400',
  medium: 'text-yellow-400',
  high:   'text-red-400',
}

export default async function AgentsPage() {
  const data = await apiFetch<AgentListResponse>('/agents').catch(() => ({ agents: [], total: 0 }))

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#E3C4E9]">Agent Registry</h1>
        <p className="text-[#704786] text-sm mt-1">{data.total} registered agents</p>
      </div>

      <div className="space-y-3">
        {data.agents.map((agent) => (
          <details key={agent.agentId} className="bg-[#1a0f22] border border-[#462C55] rounded-lg group">
            <summary className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#2d1440] transition-colors rounded-lg list-none">
              <div className="flex-1 flex items-center gap-4">
                <span className="text-[#E3C4E9] font-semibold">{agent.name}</span>
                <span className="text-[#704786] text-xs">{agent.role}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-medium ${RISK_STYLES[agent.riskLevel] ?? 'text-[#A977BF]'}`}>
                  {agent.riskLevel} risk
                </span>
                <span className="text-[#704786] text-xs">{agent.approvedTools.length} tools</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ring-1 ring-inset ${
                    STATUS_STYLES[agent.status] ?? STATUS_STYLES.revoked
                  }`}
                >
                  {agent.status}
                </span>
                <span className="text-[#704786] text-xs ml-2 group-open:hidden">▸</span>
                <span className="text-[#704786] text-xs ml-2 hidden group-open:inline">▾</span>
              </div>
            </summary>

            <div className="px-5 pb-5 border-t border-[#2d1440] mt-0 pt-4">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-[#704786] text-xs font-medium uppercase tracking-wide mb-2">
                    Approved Tools ({agent.approvedTools.length})
                  </div>
                  <div className="space-y-1">
                    {agent.approvedTools.map((t) => (
                      <div key={t} className="text-[#A977BF] text-xs px-2 py-1 bg-[#110918] rounded font-mono">
                        {t}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[#704786] text-xs font-medium uppercase tracking-wide mb-2">
                    Allowed Actions ({agent.allowedActions.length})
                  </div>
                  <div className="space-y-1">
                    {agent.allowedActions.map((a) => (
                      <div key={a} className="text-[#704786] text-xs px-2 py-1 bg-[#110918] rounded font-mono">
                        {a}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 text-[#462C55] text-xs font-mono">
                ID: {agent.agentId} · Created {new Date(agent.createdAt).toLocaleDateString()}
              </div>
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

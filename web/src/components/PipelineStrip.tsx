'use client'

type CardState = 'idle' | 'thinking' | 'done' | 'failed'

interface AgentViewState {
  name: string
  cardState: CardState
}

interface PipelineStripProps {
  agents: AgentViewState[]
  activeIndex: number
}

const STEP_LABELS = [
  'Intake', 'Retrieval', 'Signals', 'Evidence', 'Summary', 'Policy', 'Gate',
]

export function PipelineStrip({ agents, activeIndex }: PipelineStripProps) {
  return (
    <div
      style={{
        background: '#0d0815',
        border: '1px solid #2d1440',
        borderRadius: '12px',
        padding: '20px 24px',
        marginBottom: '24px',
      }}
    >
      <div style={{ color: '#704786', fontSize: '9px', letterSpacing: '0.12em', marginBottom: '16px' }}>
        AGENT PIPELINE
      </div>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {agents.map((agent, i) => {
          const isActive = i === activeIndex
          const isDone = agent.cardState === 'done'
          const isFailed = agent.cardState === 'failed'

          const nodeColor =
            isFailed  ? '#ef4444'
            : isDone  ? '#22c55e'
            : isActive ? '#A977BF'
            : '#2d1440'

          const nodeBg =
            isFailed  ? 'rgba(239,68,68,0.15)'
            : isDone  ? 'rgba(34,197,94,0.15)'
            : isActive ? 'rgba(169,119,191,0.2)'
            : '#150c1e'

          const nodeTextColor =
            isFailed  ? '#ef4444'
            : isDone  ? '#22c55e'
            : isActive ? '#E3C4E9'
            : '#462C55'

          // Connector after this node (skip last)
          const connectorActive = isActive
          const connectorDone = isDone && i < activeIndex

          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < agents.length - 1 ? 'none' : 'none' }}>
              {/* Step node */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: `2px solid ${nodeColor}`,
                    background: nodeBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: isActive ? 'step-ring 1.5s ease-in-out infinite' : 'none',
                    transition: 'border-color 0.4s ease, background 0.4s ease',
                  }}
                >
                  {isDone ? (
                    <span style={{ color: '#22c55e', fontSize: '14px' }}>✓</span>
                  ) : isFailed ? (
                    <span style={{ color: '#ef4444', fontSize: '14px' }}>✗</span>
                  ) : (
                    <span style={{ color: nodeTextColor, fontSize: '11px', fontWeight: 700 }}>
                      {i + 1}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    color: nodeTextColor,
                    fontSize: '9px',
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    transition: 'color 0.4s ease',
                  }}
                >
                  {STEP_LABELS[i]}
                </span>
              </div>

              {/* Connector line between nodes */}
              {i < agents.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    minWidth: '24px',
                    height: '2px',
                    marginBottom: '16px',
                    background: connectorActive
                      ? 'linear-gradient(90deg, #462C55, #8D5FA5, #A977BF, #8D5FA5, #462C55)'
                      : connectorDone
                      ? '#22c55e'
                      : '#2d1440',
                    backgroundSize: connectorActive ? '200% 100%' : '100% 100%',
                    animation: connectorActive ? 'pipeline-flow 2s linear infinite' : 'none',
                    transition: 'background 0.4s ease',
                    borderRadius: '1px',
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

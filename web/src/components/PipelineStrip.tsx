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
        background: '#0d0920',
        border: '1px solid #3b0f6e',
        borderRadius: '14px',
        padding: '20px 28px',
        marginBottom: '24px',
      }}
    >
      <style>{`
        @keyframes node-ring {
          0%,100% { box-shadow: 0 0 0 0 rgba(232,121,249,0.7); }
          50%      { box-shadow: 0 0 0 10px rgba(232,121,249,0); }
        }
        @keyframes connector-flow {
          0%   { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>

      <div style={{ color: '#c084fc', fontSize: '9px', letterSpacing: '0.14em', marginBottom: '18px', fontWeight: 700 }}>
        AGENT PIPELINE
      </div>

      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {agents.map((agent, i) => {
          const isActive = i === activeIndex
          const isDone   = agent.cardState === 'done'
          const isFailed = agent.cardState === 'failed'

          const nodeColor =
            isFailed  ? '#f87171'
            : isDone  ? '#4ade80'
            : isActive ? '#e879f9'
            : '#2d1060'

          const nodeBg =
            isFailed  ? 'rgba(248,113,113,0.18)'
            : isDone  ? 'rgba(74,222,128,0.18)'
            : isActive ? 'rgba(232,121,249,0.22)'
            : '#100830'

          const nodeTextColor =
            isFailed  ? '#f87171'
            : isDone  ? '#4ade80'
            : isActive ? '#f0e6ff'
            : '#4a2070'

          const connectorFilled = isDone || (i < activeIndex)

          return (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', flex: i < agents.length - 1 ? 1 : 'none' }}
            >
              {/* Step node */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '7px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    border: `2px solid ${nodeColor}`,
                    background: nodeBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: isActive ? 'node-ring 1.4s ease-in-out infinite' : 'none',
                    transition: 'border-color 0.3s ease, background 0.3s ease',
                    flexShrink: 0,
                  }}
                >
                  {isDone ? (
                    <span style={{ color: '#4ade80', fontSize: '15px' }}>✓</span>
                  ) : isFailed ? (
                    <span style={{ color: '#f87171', fontSize: '15px' }}>✗</span>
                  ) : (
                    <span style={{ color: nodeTextColor, fontSize: '11px', fontWeight: 800 }}>
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
                    fontWeight: isActive ? 700 : 400,
                    transition: 'color 0.3s ease',
                  }}
                >
                  {STEP_LABELS[i]}
                </span>
              </div>

              {/* Connector */}
              {i < agents.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    minWidth: '20px',
                    height: '3px',
                    marginBottom: '18px',
                    borderRadius: '2px',
                    background: isActive
                      ? 'linear-gradient(90deg, #7c3aed, #e879f9, #c084fc, #e879f9, #7c3aed)'
                      : connectorFilled
                      ? '#4ade80'
                      : '#1e0f3a',
                    backgroundSize: isActive ? '200% 100%' : '100% 100%',
                    animation: isActive ? 'connector-flow 1.8s linear infinite' : 'none',
                    transition: 'background 0.4s ease',
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

'use client'

type CardState = 'idle' | 'thinking' | 'done' | 'failed'

interface AgentCardProps {
  name: string
  emoji: string
  cardState: CardState
  thought: string
  thoughtKey: number
  result: string | null
  errorMsg: string | null
}

export function AgentCard({ name, emoji, cardState, thought, thoughtKey, result, errorMsg }: AgentCardProps) {
  const borderColor =
    cardState === 'thinking' ? '#8D5FA5'
    : cardState === 'done'    ? '#22c55e'
    : cardState === 'failed'  ? '#ef4444'
    : '#2d1440'

  const glowAnimation =
    cardState === 'thinking' ? 'glow-purple 2s ease-in-out infinite'
    : cardState === 'done'   ? 'glow-green 3s ease-in-out infinite'
    : cardState === 'failed' ? 'glow-red 2s ease-in-out infinite'
    : 'none'

  const opacity = cardState === 'idle' ? 0.55 : 1

  const statusLabel =
    cardState === 'thinking' ? 'THINKING'
    : cardState === 'done'   ? 'DONE'
    : cardState === 'failed' ? 'FAILED'
    : 'IDLE'

  const statusColor =
    cardState === 'thinking' ? '#A977BF'
    : cardState === 'done'   ? '#22c55e'
    : cardState === 'failed' ? '#ef4444'
    : '#462C55'

  return (
    <div
      style={{
        border: `1px solid ${borderColor}`,
        animation: glowAnimation,
        opacity,
        transition: 'opacity 0.4s ease, border-color 0.4s ease',
        borderRadius: '12px',
        padding: '18px',
        background: '#150c1e',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        minHeight: '200px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '22px' }}>{emoji}</span>
          <span style={{ color: '#E3C4E9', fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em' }}>
            {name}
          </span>
        </div>
        <span style={{ color: statusColor, fontSize: '9px', fontWeight: 700, letterSpacing: '0.1em' }}>
          {statusLabel}
        </span>
      </div>

      {/* Thinking dots */}
      {cardState === 'thinking' && (
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', height: '18px' }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#A977BF',
                animation: `dot-bounce 1.2s ease-in-out infinite ${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Done checkmark */}
      {cardState === 'done' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#22c55e', fontSize: '14px' }}>✓</span>
          <span style={{ color: '#22c55e', fontSize: '11px' }}>{result}</span>
        </div>
      )}

      {/* Failed */}
      {cardState === 'failed' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#ef4444', fontSize: '14px' }}>✗</span>
          <span style={{ color: '#ef4444', fontSize: '10px', wordBreak: 'break-word' }}>
            {errorMsg ?? 'Step failed'}
          </span>
        </div>
      )}

      {/* Thought bubble */}
      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid #2d1440',
          paddingTop: '10px',
        }}
      >
        <div style={{ color: '#704786', fontSize: '9px', letterSpacing: '0.08em', marginBottom: '4px' }}>
          {cardState === 'thinking' ? '💬 THINKING' : cardState === 'done' ? '💬 SAID' : '💬 IDLE THOUGHT'}
        </div>
        <span
          key={thoughtKey}
          style={{
            color: cardState === 'thinking' ? '#E3C4E9' : '#A977BF',
            fontSize: '11px',
            lineHeight: 1.5,
            display: 'block',
            animation: 'thought-fade 0.4s ease-out',
            fontStyle: 'italic',
          }}
        >
          &ldquo;{thought}&rdquo;
        </span>
      </div>
    </div>
  )
}

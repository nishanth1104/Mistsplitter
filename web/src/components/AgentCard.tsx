'use client'

import { PixelCharacter } from './PixelCharacter'

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

export function AgentCard({ name, cardState, thought, thoughtKey, result, errorMsg }: AgentCardProps) {
  const borderColor =
    cardState === 'thinking' ? '#9333ea'
    : cardState === 'done'   ? '#16a34a'
    : cardState === 'failed' ? '#dc2626'
    : '#1e0f3a'

  const glowColor =
    cardState === 'thinking' ? 'rgba(147,51,234,0.35)'
    : cardState === 'done'   ? 'rgba(22,163,74,0.3)'
    : cardState === 'failed' ? 'rgba(220,38,38,0.3)'
    : 'transparent'

  const statusColor =
    cardState === 'thinking' ? '#e879f9'
    : cardState === 'done'   ? '#4ade80'
    : cardState === 'failed' ? '#f87171'
    : '#4a2070'

  const statusLabel =
    cardState === 'thinking' ? 'WORKING'
    : cardState === 'done'   ? 'DONE ✓'
    : cardState === 'failed' ? 'FAILED'
    : 'IDLE'

  const bgColor =
    cardState === 'thinking' ? '#100820'
    : cardState === 'done'   ? '#0a1a10'
    : cardState === 'failed' ? '#1a0808'
    : '#0c0920'

  return (
    <>
      <style>{`
        @keyframes dot-bounce {
          0%,100% { transform: translateY(0); opacity: 0.5; }
          50%      { transform: translateY(-6px); opacity: 1; }
        }
        @keyframes thought-fade {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes card-pulse-thinking {
          0%,100% { box-shadow: 0 0 10px 2px rgba(147,51,234,0.25); }
          50%     { box-shadow: 0 0 28px 8px rgba(232,121,249,0.5); }
        }
        @keyframes card-pulse-done {
          0%,100% { box-shadow: 0 0 8px 2px rgba(22,163,74,0.2); }
          50%     { box-shadow: 0 0 22px 6px rgba(74,222,128,0.45); }
        }
      `}</style>

      <div
        style={{
          background: bgColor,
          border: `1px solid ${borderColor}`,
          borderRadius: '12px',
          padding: '16px 14px 14px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          minHeight: '230px',
          opacity: cardState === 'idle' ? 0.55 : 1,
          transition: 'all 0.35s ease',
          animation:
            cardState === 'thinking' ? 'card-pulse-thinking 2s ease-in-out infinite'
            : cardState === 'done'   ? 'card-pulse-done 2.5s ease-in-out infinite'
            : 'none',
          boxShadow: cardState !== 'idle' ? `0 0 14px ${glowColor}` : 'none',
        }}
      >
        {/* Pixel character */}
        <div style={{ marginTop: '4px' }}>
          <PixelCharacter agentName={name} state={cardState} />
        </div>

        {/* Name + status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <span style={{ color: '#e9d5ff', fontSize: '10px', fontWeight: 700, letterSpacing: '0.04em' }}>
            {name}
          </span>
          <span style={{
            color: statusColor,
            fontSize: '8px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            background: statusColor + '1a',
            padding: '2px 5px',
            borderRadius: '3px',
          }}>
            {statusLabel}
          </span>
        </div>

        {/* Thinking dots */}
        {cardState === 'thinking' && (
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', height: '14px' }}>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: '#e879f9',
                  animation: `dot-bounce 1s ease-in-out infinite ${i * 0.16}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Done result */}
        {cardState === 'done' && result && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ color: '#4ade80', fontSize: '10px' }}>{result}</span>
          </div>
        )}

        {/* Failed */}
        {cardState === 'failed' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ color: '#f87171', fontSize: '10px', wordBreak: 'break-word' }}>
              {errorMsg ?? 'step failed'}
            </span>
          </div>
        )}

        {/* Thought bubble */}
        <div
          style={{
            marginTop: 'auto',
            borderTop: `1px solid ${borderColor}44`,
            paddingTop: '8px',
            width: '100%',
          }}
        >
          <div style={{ color: '#6d28d9', fontSize: '8px', letterSpacing: '0.08em', marginBottom: '3px' }}>
            {cardState === 'thinking' ? '💬 THINKING'
              : cardState === 'done' ? '💬 SAID'
              : '💬 IDLE'}
          </div>
          <span
            key={thoughtKey}
            style={{
              color: cardState === 'thinking' ? '#f0e6ff'
                : cardState === 'done' ? '#bbf7d0'
                : '#7c3aed',
              fontSize: '10px',
              lineHeight: 1.5,
              display: 'block',
              animation: 'thought-fade 0.35s ease-out',
              fontStyle: 'italic',
            }}
          >
            &ldquo;{thought}&rdquo;
          </span>
        </div>
      </div>
    </>
  )
}

'use client'

type CardState = 'idle' | 'thinking' | 'done' | 'failed'

interface PixelCharacterProps {
  agentName: string
  state: CardState
}

// ── Shared pixel colors ────────────────────────────────────────────────────────
const SK = '#FDDCB5' // skin (brighter)
const EY = '#1a0a2e' // eyes
const MT = '#C05030' // mouth happy
const MF = '#7a1a10' // mouth frown
const SH = '#150830' // shoes

// ── Per-agent palettes (vivid) ─────────────────────────────────────────────────
const PALETTES: Record<string, { H: string; C: string; P: string }> = {
  IntakeAgent:        { H: '#9333ea', C: '#7c3aed', P: '#5b21b6' },
  RetrievalAgent:     { H: '#d97706', C: '#b45309', P: '#92400e' },
  SignalAgent:        { H: '#2563eb', C: '#3b82f6', P: '#1d4ed8' },
  EvidenceAgent:      { H: '#4b5563', C: '#f59e0b', P: '#b45309' },
  SummaryAgent:       { H: '#059669', C: '#10b981', P: '#065f46' },
  PolicyAgent:        { H: '#374151', C: '#6b7280', P: '#1f2937' },
  policy_gate:        { H: '#0369a1', C: '#0ea5e9', P: '#075985' },
  ReviewLoggerAgent:  { H: '#0f766e', C: '#14b8a6', P: '#134e4a' },
}
const DEFAULT_PAL = { H: '#9333ea', C: '#7c3aed', P: '#5b21b6' }

// ── Pixel grid builder ─────────────────────────────────────────────────────────
type Row = (string | null)[]

function buildGrid(H: string, C: string, P: string, state: CardState): Row[] {
  const mouth = state === 'failed'
    ? [null, SK,  SK,  MF,  SK,  SK,  SK,  MF,  SK,  null]
    : [null, SK,  SK,  SK,  MT,  MT,  SK,  SK,  SK,  null]

  const armsOut:     Row = [SK,   SK,   C,    C,    C,    C,    C,    C,    SK,   SK  ]
  const armsRaisedA: Row = [SK,   null, C,    C,    C,    C,    C,    C,    null, SK  ]
  const armsRaisedB: Row = [null, SK,   C,    C,    C,    C,    C,    C,    SK,   null]
  const armsDown:    Row = [null, null, C,    C,    C,    C,    C,    C,    null, null]

  const isDone = state === 'done'

  return [
    [null, null, null, H,    H,    H,    H,    null, null, null],
    [null, null, H,    H,    H,    H,    H,    H,    null, null],
    [null, null, SK,   SK,   SK,   SK,   SK,   SK,   null, null],
    [null, SK,   SK,   EY,   SK,   SK,   EY,   SK,   SK,   null],
    [null, SK,   SK,   SK,   SK,   SK,   SK,   SK,   SK,   null],
    mouth,
    [null, SK,   SK,   SK,   SK,   SK,   SK,   SK,   SK,   null],
    isDone ? armsRaisedA : [null, null, C, C, C, C, C, C, null, null],
    isDone ? armsRaisedB : [null, C, C, C, C, C, C, C, C, null],
    isDone ? armsDown    : armsOut,
    [null, null, C,    C,    C,    C,    C,    C,    null, null],
    [null, null, C,    C,    C,    C,    C,    C,    null, null],
    [null, null, P,    P,    null, null, P,    P,    null, null],
    [null, null, P,    P,    null, null, P,    P,    null, null],
    [null, null, SH,   SH,   null, null, SH,   SH,   null, null],
    [null, null, SH,   SH,   null, null, SH,   SH,   null, null],
  ]
}

const PS   = 6
const COLS = 10
const ROWS = 16
const W    = COLS * PS  // 60
const H_   = ROWS * PS  // 96

export function PixelCharacter({ agentName, state }: PixelCharacterProps) {
  const pal  = PALETTES[agentName] ?? DEFAULT_PAL
  const grid = buildGrid(pal.H, pal.C, pal.P, state)

  const wrapAnim =
    state === 'thinking' ? 'px-think 0.5s ease-in-out infinite alternate'
    : state === 'done'   ? 'px-celebrate 1.4s ease-in-out infinite'
    : state === 'failed' ? 'px-shake 0.3s ease-in-out infinite'
    : 'px-float 3s ease-in-out infinite'

  return (
    <>
      <style>{`
        @keyframes px-float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-5px); }
        }
        @keyframes px-think {
          0%   { transform: translateY(0px) rotate(0deg); }
          100% { transform: translateY(-5px) rotate(-4deg); }
        }
        @keyframes px-celebrate {
          0%,100% { transform: translateY(0px) scale(1) rotate(0deg); }
          25%     { transform: translateY(-10px) scale(1.08) rotate(-3deg); }
          75%     { transform: translateY(-5px) scale(1.04) rotate(3deg); }
        }
        @keyframes px-shake {
          0%,100% { transform: translateX(0) rotate(0deg); }
          20%     { transform: translateX(-5px) rotate(-5deg); }
          40%     { transform: translateX(5px) rotate(5deg); }
          60%     { transform: translateX(-3px) rotate(-3deg); }
          80%     { transform: translateX(3px) rotate(3deg); }
        }
      `}</style>
      <div style={{ display: 'inline-block', animation: wrapAnim, imageRendering: 'pixelated' }}>
        <svg
          width={W}
          height={H_}
          viewBox={`0 0 ${W} ${H_}`}
          style={{ display: 'block', imageRendering: 'pixelated' }}
        >
          {grid.map((row, r) =>
            row.map((color, c) =>
              color !== null ? (
                <rect
                  key={`${r}-${c}`}
                  x={c * PS}
                  y={r * PS}
                  width={PS}
                  height={PS}
                  fill={color}
                />
              ) : null
            )
          )}
        </svg>
      </div>
    </>
  )
}

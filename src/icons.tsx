import type { JSX } from 'react'

/** Ícone de mando: casa (mandante). */
export function HomeIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6 10.5V20h12v-9.5" />
      <path d="M10 20v-5h4v5" />
    </svg>
  )
}

/** Ícone de mando: fora (visitante). */
export function AwayIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10.5 13.5 4 7l2-2 6.5 6.5M13 4h7v7" />
      <path d="M20 4 10 14" />
      <path d="m5 12-2 7 7-2" />
    </svg>
  )
}

/** Ícone de bola (estatísticas gerais). */
export function BallIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m12 8.5 3.2 2.4-1.2 3.8h-4l-1.2-3.8L12 8.5ZM12 3.5v5M4 11l3.9-.1M20 11l-3.9-.1M7.5 18.7l2.3-3.2M16.5 18.7l-2.3-3.2" />
    </svg>
  )
}

/** Ícone de calendário (jogos). */
export function CalendarIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M4 10h16M8 4v4M16 4v4M8 14h3M13 14h3M8 17h3" />
    </svg>
  )
}

/** Ícone de gráfico (projeções). */
export function ChartIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}

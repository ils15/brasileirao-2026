import type { JSX } from 'react'

/** Ícone de mando: casa (mandante). */
export function HomeIcon({ className = 'venue-icon venue-icon--filled' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 11.2 12 3.5l8.5 7.7h-2.3V20h-5v-5.4h-2.4V20h-5v-8.8H3.5Z" />
    </svg>
  )
}

/** Ícone de mando: fora (visitante). */
export function AwayIcon({ className = 'venue-icon venue-icon--filled' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 15.5 13.5 12 8 4.5l1.8-1.3L17.5 9l3.6-1.2c.5-.2 1 .3.9.8l-1 6.9ZM7.8 14.2l3.4 3.4-1 3.9c-.2.6-.9.7-1.3.3l-3-3-2.9 1 1-2.9-3-3c-.4-.4-.3-1.1.3-1.3l3.9-1 3.4 3.4Z" />
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

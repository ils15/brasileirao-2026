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

/** Ícone de escudo (perfil truncado / defesas fortes). */
export function ShieldIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 19 6.3v4.9c0 4.4-3 8.3-7 9.8-4-1.5-7-5.4-7-9.8V6.3L12 3.5Z" />
    </svg>
  )
}

/** Ícone de balança (perfil equilibrado). */
export function ScalesIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v16M8 20h8M5 7h14M12 5 5.5 7 12 5l6.5 2L12 5Z" />
      <path d="M5 7 2.5 13h5L5 7Zm14 0-2.5 6h5L19 7Z" />
    </svg>
  )
}

/** Ícone de estouro/explosão (perfil elástico). */
export function BurstIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3 1.8 3.6 3.7-1.6-.9 4 4.4 1.3-3.2 2.7 1.8 3.7-4.1.5-.9 4.2-2.6-2.9-2.6 2.9-.9-4.2-4.1-.5 1.8-3.7L2 10.3l4.4-1.3-.9-4 3.7 1.6L12 3Z" />
    </svg>
  )
}

/** Ícone de chama (perfil goleadas). */
export function FireIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21.5c3.9 0 6.5-2.7 6.5-6.4 0-3.6-2.7-5.4-3.6-8.1-1.7 1.7-2.7 2.7-2.7 4.5-.9-.9-1.4-1.8-1.4-3.6C9 10 5.5 11.9 5.5 15.1c0 3.7 2.6 6.4 6.5 6.4Z" />
    </svg>
  )
}

/** Ícone de engrenagem (modulador de gols). */
export function GearIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3m0 13v3M4.9 4.9l2.1 2.1m10 10 2.1 2.1M2.5 12h3m13 0h3M4.9 19.1l2.1-2.1m10-10 2.1-2.1" />
    </svg>
  )
}

/** Ícone de dado (sorteio estocástico). */
export function DiceIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Ícone de alvo (resultados mais prováveis). */
export function TargetIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Ícone de raio (favoritos). */
export function BoltIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2.5 4.5 14h5.5l-1 7.5L17.5 10H12l1-7.5Z" />
    </svg>
  )
}

/** Ícone de joystick (simulador interativo). */
export function GamepadIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 8.5h11a4.5 4.5 0 0 1 4.5 4.5c0 2.8-2 5.5-4.8 5.5-1.6 0-2.7-1-3.7-2h-3c-1 1-2.1 2-3.7 2C4 18.5 2 15.8 2 13a4.5 4.5 0 0 1 4.5-4.5Z" />
      <path d="M8 11v4m-2-2h4m5.5-1h.01m2.5 2h.01" />
    </svg>
  )
}

/** Ícone de informação (resumos de metodologia). */
export function InfoIcon({ className = 'venue-icon' }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

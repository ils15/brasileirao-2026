import { useState, type JSX } from 'react'
import { espnLogoUrl } from './projectionData'

const SIZES = { xs: 18, medium: 22, large: 34, xl: 56 } as const

/** Escudo real (CDN ESPN); some silenciosamente se a imagem falhar. */
export function Crest({ clubId, size = 'medium' }: { clubId: string; size?: keyof typeof SIZES }): JSX.Element | null {
  const [failed, setFailed] = useState(false)
  const logo = espnLogoUrl(clubId)
  if (!logo || failed) return null
  return (
    <img
      className={`crest crest--${size}`}
      src={logo}
      alt=""
      aria-hidden="true"
      loading="lazy"
      width={SIZES[size]}
      height={SIZES[size]}
      onError={() => setFailed(true)}
    />
  )
}

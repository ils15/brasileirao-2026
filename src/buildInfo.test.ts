import { describe, expect, it, vi } from 'vitest'
import { buildInfo, resolveBuildInfo } from './buildInfo'

describe('buildInfo', () => {
  it('cai no fallback dev quando nenhuma global de build está definida', () => {
    expect(resolveBuildInfo({})).toEqual({ version: 'dev', sha: 'dev', sha7: 'dev', time: null })
  })

  it('deriva sha7 dos sete primeiros caracteres do SHA', () => {
    expect(
      resolveBuildInfo({ version: '1.2.3', sha: '0123456789abcdef', time: '2026-01-02T03:04:05.000Z' }),
    ).toEqual({
      version: '1.2.3',
      sha: '0123456789abcdef',
      sha7: '0123456',
      time: '2026-01-02T03:04:05.000Z',
    })
  })

  it('importa o módulo sem ReferenceError mesmo quando o define não é aplicado', async () => {
    vi.resetModules()
    const module = await import('./buildInfo')
    expect(module.buildInfo.version.length).toBeGreaterThan(0)
    expect(module.buildInfo.sha7).toBe(module.buildInfo.sha.slice(0, 7))
  })

  it('expõe sha7 consistente com o SHA resolvido em build/teste', () => {
    expect(buildInfo.sha7).toBe(buildInfo.sha.slice(0, 7))
  })
})

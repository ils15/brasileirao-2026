import { act, render, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JSX, ReactNode } from 'react'
import {
  PROJECTION_TIMEOUT_MS,
  ProjectionProvider,
  useProjection,
} from './ProjectionContext'
import { CURRENT_SEASON_PACK_GENERATED_AT } from './currentSeasonResults'
import { buildPointOutcomeCurveFromSnapshot, type PointOutcomeCurve } from './pointCurve'
import { runProjectionRaw } from './projection'
import { scenarioFromKey } from './projectionConfig'
import { deriveProjectionResult, scenarioCountsFrom } from './projectionDerived'
import { computeProjectionInputHash } from './projectionInputHash'
import { parseProjectionsSnapshot } from './projectionsSnapshot'
import { ANALYTICAL_CUTOFF_UTC } from './sourceMetadata'

/**
 * Bruto real e pequeno: o teste exercita a costura worker → derivação, sem
 * depender do worker de verdade. `backtestSimulations: 1` mantém o cold start.
 */
const RAW = runProjectionRaw({ simulations: 40, seed: 1017, backtestSimulations: 1 })

/** Hash que não existe na prática; só precisa divergir do pacote atual. */
const STALE_HASH = '0123456789abcdef'

type Listener = () => void

/** Worker mínimo: registra instâncias, mensagens e permite simular eventos. */
class FakeWorker {
  static instances: FakeWorker[] = []

  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  readonly posted: unknown[] = []
  readonly listeners = new Map<string, Set<Listener>>()
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>()
    set.add(listener)
    this.listeners.set(type, set)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener)
  }

  terminate(): void {
    this.terminated = true
  }

  emitMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent)
  }

  emitError(): void {
    this.onerror?.()
  }

  emitMessageError(): void {
    for (const listener of this.listeners.get('messageerror') ?? []) listener()
  }
}

function latestWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1)
  if (!worker) throw new Error('Nenhum worker foi criado.')
  return worker
}

/**
 * Documento no formato de `public/projecoes.json`, montado do próprio bruto.
 * O hash sai de `computeProjectionInputHash()` — o caminho mais legível: o
 * fixture já nasce correspondente ao pacote, sem mock de módulo. Quem quer
 * divergência passa um `inputHash` diferente.
 *
 * `generatedAt` vem da mesma constante que o gerador usa, nunca de um instante
 * literal; `pointCurve` é o agregado bruto da execução, como o schema 2 publica.
 */
function snapshotDocument(inputHash: string = computeProjectionInputHash()): Record<string, unknown> {
  return {
    schemaVersion: 2,
    generatedAt: CURRENT_SEASON_PACK_GENERATED_AT,
    simulations: RAW.simulations,
    seed: RAW.seed,
    backtestSimulations: 1,
    analyticalCutoffUtc: ANALYTICAL_CUTOFF_UTC,
    inputHash,
    model: {
      leagueAverageGoals: RAW.leagueAverageGoals,
      trainingGoalAverages: RAW.trainingGoalAverages,
    },
    clubs: RAW.clubs.map((club) => ({
      id: club.id,
      club: club.club,
      currentPosition: club.currentPosition,
      currentPoints: club.currentPoints,
      positionCounts: [...club.positionCounts],
      scenarioCounts: scenarioCountsFrom(club.positionCounts),
      pointsStats: { ...club.pointsStats },
    })),
    pointsByPosition: RAW.pointsByPosition.map(({ points, positionCounts }) => ({
      points,
      positionCounts: [...positionCounts],
    })),
    pointCurve: {
      simulationCount: RAW.pointCurve.simulationCount,
      points: [...RAW.pointCurve.points],
      masks: RAW.pointCurve.masks.map((masks) => [...masks]),
      counts: RAW.pointCurve.counts.map((counts) => [...counts]),
    },
    backtest: RAW.backtest,
    featureBacktest: RAW.featureBacktest,
  }
}

/** `Response` mínimo: o provider só lê `ok`, `status` e `json()`. */
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response
}

/** Artefato válido servido pelo fetch. */
function stubSnapshot(body: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => jsonResponse(body))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Sem rede: é o padrão dos testes antigos, que só querem o caminho do worker. */
function stubSnapshotUnavailable(): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => jsonResponse({}, { ok: false, status: 404 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/**
 * O caminho rápido é assíncrono (fetch → parse → hash). Flush de microtasks
 * dentro de `act` deixa o efeito chegar ao worker sem tocar em timers falsos.
 */
async function flushFastPath(): Promise<void> {
  await act(async () => {
    // fetch → parse → import dinâmico do hash: cada elo custa um tick.
    for (let tick = 0; tick < 10; tick += 1) await Promise.resolve()
  })
}

function wrapper({ children }: { children: ReactNode }): JSX.Element {
  return <ProjectionProvider>{children}</ProjectionProvider>
}

function sumLibertadores(clubs: readonly { libertadores: number }[]): number {
  return clubs.reduce((total, club) => total + club.libertadores, 0)
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)
  // O fallback do caminho rápido avisa no console; o teste não precisa do ruído.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ProjectionProvider', () => {
  it('troca de cenário por derivação: não recria o worker nem volta a carregar', async () => {
    stubSnapshotUnavailable()
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()
    expect(FakeWorker.instances).toHaveLength(1)
    expect(latestWorker().posted).toEqual([{ type: 'run' }])
    expect(result.current.status).toBe('loading')

    const worker = latestWorker()
    act(() => worker.emitMessage(RAW))
    expect(result.current.status).toBe('ready')
    expect(result.current.source).toBe('worker')
    expect(result.current.result?.simulations).toBe(40)
    const before = result.current.result!.clubProbabilities
    expect(sumLibertadores(before)).toBeCloseTo(6, 10)

    act(() => result.current.setScenario(scenarioFromKey(15)))

    expect(FakeWorker.instances).toHaveLength(1)
    expect(latestWorker().posted).toEqual([{ type: 'run' }])
    expect(result.current.status).toBe('ready')
    expect(result.current.result?.libertadoresZones.libertadoresTo).toBe(9)
    expect(sumLibertadores(result.current.result!.clubProbabilities)).toBeCloseTo(9, 10)
    expect(result.current.result!.clubProbabilities.map(({ positionCounts }) => positionCounts)).toEqual(
      before.map(({ positionCounts }) => positionCounts),
    )
  })

  it('transforma worker silencioso em erro de timeout, com caminho de retry', async () => {
    vi.useFakeTimers()
    stubSnapshotUnavailable()
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()
    expect(result.current.status).toBe('loading')

    act(() => vi.advanceTimersByTime(PROJECTION_TIMEOUT_MS))

    expect(result.current.status).toBe('error')
    expect(result.current.errorReason).toBe('timeout')
    expect(latestWorker().terminated).toBe(true)
    expect(result.current.retry).toBeTypeOf('function')
  })

  it('não dispara o timeout quando o worker responde antes', async () => {
    vi.useFakeTimers()
    stubSnapshotUnavailable()
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    act(() => latestWorker().emitMessage(RAW))
    act(() => vi.advanceTimersByTime(PROJECTION_TIMEOUT_MS))

    expect(result.current.status).toBe('ready')
    expect(result.current.errorReason).toBeNull()
  })

  it('trata messageerror como falha visível', async () => {
    stubSnapshotUnavailable()
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    act(() => latestWorker().emitMessageError())

    expect(result.current.status).toBe('error')
    expect(result.current.errorReason).toBe('error')
  })

  it('preserva o resultado anterior quando a execução seguinte falha', async () => {
    stubSnapshotUnavailable()
    function Probe(): JSX.Element {
      const { result, status, errorReason, retry } = useProjection()
      return (
        <div>
          <p data-testid="status">{status}</p>
          <p data-testid="reason">{errorReason ?? 'none'}</p>
          <p data-testid="clubs">{result ? result.clubProbabilities.length : 0}</p>
          <button type="button" onClick={retry}>tentar de novo</button>
        </div>
      )
    }

    const { getByTestId, getByText } = render(
      <ProjectionProvider>
        <Probe />
      </ProjectionProvider>,
    )
    await flushFastPath()
    act(() => latestWorker().emitMessage(RAW))
    expect(getByTestId('clubs').textContent).toBe('20')

    act(() => getByText('tentar de novo').click())
    expect(getByTestId('status').textContent).toBe('loading')
    act(() => latestWorker().emitError())

    expect(getByTestId('status').textContent).toBe('error')
    expect(getByTestId('reason').textContent).toBe('error')
    expect(getByTestId('clubs').textContent).toBe('20')
  })

  it('retry limpa o erro e cria um novo worker', async () => {
    stubSnapshotUnavailable()
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()
    act(() => latestWorker().emitMessageError())
    expect(result.current.status).toBe('error')
    expect(FakeWorker.instances).toHaveLength(1)

    act(() => result.current.retry())

    expect(FakeWorker.instances).toHaveLength(2)
    expect(result.current.status).toBe('loading')
    expect(result.current.errorReason).toBeNull()

    act(() => latestWorker().emitMessage(RAW))
    expect(result.current.status).toBe('ready')
    expect(result.current.result?.simulations).toBe(40)
  })

  it('adota o snapshot publicado quando o hash corresponde: nenhum worker é criado', async () => {
    const fetchMock = stubSnapshot(snapshotDocument())
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    expect(FakeWorker.instances).toHaveLength(0)
    expect(result.current.status).toBe('ready')
    expect(result.current.source).toBe('snapshot')
    expect(result.current.snapshotGeneratedAt).toBe(CURRENT_SEASON_PACK_GENERATED_AT)
    expect(result.current.result?.simulations).toBe(40)
    // Mesmo cenário default do worker: seis vagas pela tabela.
    expect(sumLibertadores(result.current.result!.clubProbabilities)).toBeCloseTo(6, 10)
    // A derivação continua sendo a única fonte: curva e faixas saem do bruto adotado.
    expect(result.current.result!.pointCurve.rows.length).toBeGreaterThan(0)
    expect(result.current.result!.pointsAnalysis.distributionByOutcome).toHaveLength(5)

    // Snapshot e worker partem do mesmo agregado publicado: os ICs têm de ser
    // exatamente os cluster-robustos do caminho simulado, não uma síntese.
    const fromWorker = deriveProjectionResult(RAW)
    const bounds = (curve: PointOutcomeCurve) =>
      curve.rows.map(({ points, outcome, lower95, upper95 }) => [points, outcome, lower95, upper95])
    expect(bounds(result.current.result!.pointCurve)).toEqual(bounds(fromWorker.pointCurve))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/projecoes\.json$/), expect.objectContaining({ cache: 'no-cache' }))
  })

  it('descarta o snapshot com hash divergente e recalcula no worker', async () => {
    stubSnapshot(snapshotDocument(STALE_HASH))
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    expect(FakeWorker.instances).toHaveLength(1)

    act(() => latestWorker().emitMessage(RAW))
    expect(result.current.status).toBe('ready')
    expect(result.current.source).toBe('worker')
    expect(result.current.snapshotGeneratedAt).toBeNull()
  })

  it('cai no worker quando o artefato responde 404', async () => {
    stubSnapshotUnavailable()
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    expect(FakeWorker.instances).toHaveLength(1)
    act(() => latestWorker().emitMessage(RAW))
    expect(result.current.source).toBe('worker')
  })

  it('cai no worker quando o documento está fora do contrato', async () => {
    // Só a versão: falta simulations, clubs, pointsByPosition e o hash.
    stubSnapshot({ schemaVersion: 2 })
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    expect(FakeWorker.instances).toHaveLength(1)
    act(() => latestWorker().emitMessage(RAW))
    expect(result.current.source).toBe('worker')
  })

  it('cai no worker quando a versão do schema é desconhecida', async () => {
    stubSnapshot({ ...snapshotDocument(), schemaVersion: 1 })
    renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    expect(FakeWorker.instances).toHaveLength(1)
  })

  it('cai no worker, sem erro na tela, quando pointCurve não reproduz pointsByPosition', async () => {
    const document = snapshotDocument()
    const curve = document.pointCurve as { counts: number[][] }
    // Uma simulação a mais na primeira máscara: a expansão deixa de fechar a
    // tabela marginal, então o agregado não pode ser adotado.
    const counts = curve.counts.map((row) => [...row])
    counts[0]![0] = counts[0]![0]! + 1
    stubSnapshot({ ...document, pointCurve: { ...curve, counts } })
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    expect(FakeWorker.instances).toHaveLength(1)
    expect(result.current.status).toBe('loading')
    expect(result.current.errorReason).toBeNull()
  })

  it('cai no worker quando o snapshot não publica pointCurve', async () => {
    const withoutCurve = snapshotDocument()
    delete withoutCurve.pointCurve
    stubSnapshot(withoutCurve)
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    expect(FakeWorker.instances).toHaveLength(1)
    expect(result.current.status).toBe('loading')
  })

  it('retry ignora o snapshot e força o recálculo no worker', async () => {
    const fetchMock = stubSnapshot(snapshotDocument())
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()
    expect(result.current.source).toBe('snapshot')
    expect(FakeWorker.instances).toHaveLength(0)

    act(() => result.current.retry())

    expect(FakeWorker.instances).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    act(() => latestWorker().emitMessage(RAW))
    expect(result.current.status).toBe('ready')
    expect(result.current.source).toBe('worker')
  })

  it('com snapshot carregado, trocar de cenário não refaz fetch nem cria worker', async () => {
    const fetchMock = stubSnapshot(snapshotDocument())
    const { result } = renderHook(() => useProjection(), { wrapper })
    await flushFastPath()

    const before = result.current.result!.clubProbabilities
    expect(sumLibertadores(before)).toBeCloseTo(6, 10)

    act(() => result.current.setScenario(scenarioFromKey(15)))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(FakeWorker.instances).toHaveLength(0)
    expect(result.current.source).toBe('snapshot')
    expect(result.current.status).toBe('ready')
    expect(result.current.result?.libertadoresZones.libertadoresTo).toBe(9)
    expect(sumLibertadores(result.current.result!.clubProbabilities)).toBeCloseTo(9, 10)
    expect(result.current.result!.clubProbabilities.map(({ positionCounts }) => positionCounts)).toEqual(
      before.map(({ positionCounts }) => positionCounts),
    )
  })
})

describe('parseProjectionsSnapshot', () => {
  it('converte o documento publicado no shape bruto do worker', () => {
    const raw = parseProjectionsSnapshot(snapshotDocument())

    expect(raw).not.toBeNull()
    expect(raw!.simulations).toBe(RAW.simulations)
    expect(raw!.clubs).toHaveLength(20)
    expect(raw!.clubs[0]!.positionCounts).toHaveLength(21)
    expect(raw!.pointsByPosition.length).toBeGreaterThan(0)
    // A curva vem do arquivo, não de uma síntese das marginais.
    expect(raw!.pointCurve).toEqual({
      simulationCount: RAW.pointCurve.simulationCount,
      points: [...RAW.pointCurve.points],
      masks: RAW.pointCurve.masks.map((masks) => [...masks]),
      counts: RAW.pointCurve.counts.map((counts) => [...counts]),
    })
  })

  it('reproduz os ICs cluster-robustos do worker a partir do agregado publicado', () => {
    const raw = parseProjectionsSnapshot(snapshotDocument())!
    const fromSnapshot = buildPointOutcomeCurveFromSnapshot(raw.pointCurve)
    const fromWorker = deriveProjectionResult(RAW).pointCurve

    expect(fromSnapshot.rows).toEqual(fromWorker.rows)
    expect(fromSnapshot.inclusiveLibertadores).toEqual(fromWorker.inclusiveLibertadores)
  })

  const invalidPatches: Array<[string, Record<string, unknown>]> = [
    ['schemaVersion desconhecido', { schemaVersion: 1 }],
    ['inputHash vazio', { inputHash: '' }],
    ['menos de 20 clubes', { clubs: (snapshotDocument().clubs as unknown[]).slice(0, 19) }],
    ['simulations zero', { simulations: 0 }],
    ['pointsByPosition ausente', { pointsByPosition: [] }],
  ]

  it.each(invalidPatches)('devolve null para %s', (_label, patch) => {
    expect(parseProjectionsSnapshot({ ...snapshotDocument(), ...patch })).toBeNull()
  })

  it('devolve null quando pointCurve está ausente', () => {
    const document = snapshotDocument()
    delete document.pointCurve
    expect(parseProjectionsSnapshot(document)).toBeNull()
  })

  it('devolve null quando pointCurve.simulationCount diverge de simulations', () => {
    const document = snapshotDocument()
    const curve = document.pointCurve as { simulationCount: number }
    expect(parseProjectionsSnapshot({ ...document, pointCurve: { ...curve, simulationCount: 41 } })).toBeNull()
  })

  it('devolve null quando points, masks e counts têm comprimentos diferentes', () => {
    const document = snapshotDocument()
    const curve = document.pointCurve as { points: number[]; masks: number[][]; counts: number[][] }
    expect(parseProjectionsSnapshot({
      ...document,
      pointCurve: { ...curve, counts: curve.counts.slice(1) },
    })).toBeNull()
    expect(parseProjectionsSnapshot({
      ...document,
      pointCurve: { ...curve, masks: curve.masks.map((row, index) => (index === 0 ? row.slice(1) : row)) },
    })).toBeNull()
  })

  it('devolve null quando uma máscara sai dos 20 bits da tabela', () => {
    const document = snapshotDocument()
    const curve = document.pointCurve as { masks: number[][] }
    const masks = curve.masks.map((row) => [...row])
    masks[0]![0] = 2 ** 20
    expect(parseProjectionsSnapshot({
      ...document,
      pointCurve: { ...curve, masks },
    })).toBeNull()
  })

  it('devolve null quando a soma das máscaras não reproduz pointsByPosition', () => {
    const document = snapshotDocument()
    const curve = document.pointCurve as { counts: number[][] }
    const counts = curve.counts.map((row) => [...row])
    counts[0]![0] = counts[0]![0]! + 1
    expect(parseProjectionsSnapshot({
      ...document,
      pointCurve: { ...curve, counts },
    })).toBeNull()
  })

  it('devolve null quando points omitem uma pontuação de pointsByPosition', () => {
    const document = snapshotDocument()
    const curve = document.pointCurve as { points: number[]; masks: number[][]; counts: number[][] }
    expect(parseProjectionsSnapshot({
      ...document,
      pointCurve: {
        ...curve,
        points: curve.points.slice(1),
        masks: curve.masks.slice(1),
        counts: curve.counts.slice(1),
      },
    })).toBeNull()
  })

  it('devolve null quando positionCounts não tem as 21 posições', () => {
    const document = snapshotDocument()
    const clubs = document.clubs as Record<string, unknown>[]
    const first = { ...clubs[0]!, positionCounts: (clubs[0]!.positionCounts as number[]).slice(0, 20) }
    expect(parseProjectionsSnapshot({ ...document, clubs: [first, ...clubs.slice(1)] })).toBeNull()
  })

  it('devolve null quando uma linha de scenarioCounts quebra a ordem do bitmask', () => {
    const document = snapshotDocument()
    const clubs = document.clubs as Record<string, unknown>[]
    const scenarios = clubs[0]!.scenarioCounts as Record<string, unknown>[]
    const broken = scenarios.map((entry, index) => (index === 0 ? { ...entry, scenarioKey: 3 } : entry))
    expect(parseProjectionsSnapshot({ ...document, clubs: [{ ...clubs[0]!, scenarioCounts: broken }, ...clubs.slice(1)] })).toBeNull()
  })

  it('devolve null quando a tabela global não fecha simulations × clubes', () => {
    const document = snapshotDocument()
    const rows = document.pointsByPosition as Record<string, unknown>[]
    const first = { ...rows[0]!, points: rows[0]!.points, positionCounts: [...(rows[0]!.positionCounts as number[])] }
    first.positionCounts[1] += 1
    expect(parseProjectionsSnapshot({ ...document, pointsByPosition: [first, ...rows.slice(1)] })).toBeNull()
  })

  it('devolve null para entrada que não é objeto', () => {
    expect(parseProjectionsSnapshot(null)).toBeNull()
    expect(parseProjectionsSnapshot('projecoes')).toBeNull()
  })
})

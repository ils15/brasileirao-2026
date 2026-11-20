import { createContext, useContext, useEffect, useMemo, useState, type JSX, type ReactNode } from 'react'
import { deriveProjectionResult, type RawProjectionResult } from './projectionDerived'
import {
  DEV_SIMULATION_COUNT,
  LIBERTADORES_LINES,
  SIMULATION_COUNT,
  type LibertadoresScenario,
} from './projectionConfig'
import type { ProjectionResult } from './projection'
import { parseProjectionsSnapshotEntry, type ProjectionsSnapshot } from './projectionsSnapshot'

export type ProjectionStatus = 'loading' | 'ready' | 'error'

/**
 * Por que o worker falhou: `timeout` quando ele nunca respondeu dentro do
 * orçamento, `error` quando falhou ao iniciar ou emitiu erro/`messageerror`.
 * A UI usa isso para escolher a explicação — as duas oferecem `retry`.
 */
export type ProjectionErrorReason = 'timeout' | 'error'

/**
 * De onde veio o resultado exibido: artefato publicado pelo pipeline
 * (`snapshot`) ou Monte Carlo recalculado neste navegador (`worker`).
 */
export type ProjectionSource = 'snapshot' | 'worker'

/**
 * Teto de espera do worker one-shot. Em `serve` o Monte Carlo reduzido
 * (`DEV_SIMULATION_COUNT`) termina em segundos; o teto menor só evita spinner
 * eterno após um reload descartar o run. Produção mantém folga para a máquina
 * mais lenta.
 */
export const PROJECTION_TIMEOUT_MS = import.meta.env.DEV ? 60_000 : 120_000

/**
 * Teto do fetch do artefato publicado. Ele é local, estático e pequeno; se não
 * responder nesse prazo, o caminho rápido falhou e o worker assume. Este teto
 * é independente do watchdog: o worker pode levar 120 s, o arquivo não.
 */
export const SNAPSHOT_FETCH_TIMEOUT_MS = 5_000

/**
 * `BASE_URL` mantém o caminho certo sob o subdiretório do Pages
 * (`/brasileirao-2026/`). `no-cache` força revalidação: um arquivo velho em
 * cache do browser seria aceito pelo hash só se o pacote também fosse velho.
 */
const SNAPSHOT_URL = `${import.meta.env.BASE_URL}projecoes.json`

/** Simulações esperadas neste ambiente, antes de existir resultado do worker. */
export const EXPECTED_SIMULATION_COUNT = import.meta.env.DEV ? DEV_SIMULATION_COUNT : SIMULATION_COUNT

interface ProjectionContextValue {
  result: ProjectionResult | null
  status: ProjectionStatus
  /** Motivo da falha quando `status === 'error'`; `null` nos demais estados. */
  errorReason: ProjectionErrorReason | null
  retry: () => void
  scenario: LibertadoresScenario
  setScenario: (scenario: LibertadoresScenario) => void
  /** Linhas de corte cobertas pelo resultado: G-5 a G-9. */
  availableLines: readonly number[]
  /** Proveniência do resultado exibido; `null` enquanto não há resultado. */
  source: ProjectionSource | null
  /** Carimbo do pacote embutido no artefato publicado, quando `source === 'snapshot'`. */
  snapshotGeneratedAt: string | null
}

const ProjectionContext = createContext<ProjectionContextValue | null>(null)

/**
 * Estado real do campeonato em 2026: o Palmeiras está na final da Copa do
 * Brasil e dentro do G-5, então o campeão da Copa do Brasil já devolve a vaga
 * preliminar (o vice sobe para a fase de grupos) — linha G-6. As demais copas
 * ainda não têm detentor classificado pela tabela.
 */
const CURRENT_LIBERTADORES_SCENARIO: LibertadoresScenario = {
  copaDoBrasilCampeaoDevolvido: true,
  copaDoBrasilViceDevolvido: false,
  libertadoresCampeaoDevolvido: false,
  sudamericanaCampeaoDevolvido: false,
}

/** Falha do caminho rápido é esperada; um aviso curto basta, sem poluir a UI. */
function warnSnapshotIgnored(reason: string): void {
  console.warn(`projecoes.json ignorado (${reason}); recalculando no worker.`)
}

/**
 * Um único Web Worker de projeção compartilhado pelas abas Projeções e
 * Metodologia & Validação — as simulações rodam uma vez, não duas. `enabled`
 * adia a criação do worker até a primeira aba que consome a projeção abrir;
 * depois disso o worker permanece (o resultado é compartilhado).
 *
 * Caminho rápido: `public/projecoes.json` já traz o resultado bruto da mesma
 * `runProjectionRaw()`. Quando o artefato é válido **e** o `inputHash` bate com
 * o pacote deste build, ele vira o resultado sem instanciar worker nenhum
 * (~18 s de simulação evitados). Qualquer falha — 404, rede, JSON malformado,
 * hash divergente — cai no worker, que continua sendo o caminho de verdade.
 *
 * O worker é one-shot e independente de cenário: ele devolve o resultado bruto
 * (histogramas de posição, curva por posição, backtests). Trocar de cenário é
 * derivação pura em `useMemo` — nunca re-simula, nunca refaz o fetch e nunca
 * volta a `loading`. `retry`, ao contrário, ignora o artefato e força o worker:
 * é o usuário pedindo recálculo de verdade.
 *
 * Resiliência: um watchdog encerra o worker que não responde e transforma o
 * silêncio em erro com `retry`; erros preservam o último `rawResult` bom, então
 * a UI degrada em vez de apagar as tabelas.
 */
export function ProjectionProvider({ children, enabled = true }: { children: ReactNode; enabled?: boolean }): JSX.Element {
  const [rawResult, setRawResult] = useState<RawProjectionResult | null>(null)
  const [status, setStatus] = useState<ProjectionStatus>('loading')
  const [errorReason, setErrorReason] = useState<ProjectionErrorReason | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [started, setStarted] = useState(enabled)
  const [scenario, setScenario] = useState<LibertadoresScenario>(CURRENT_LIBERTADORES_SCENARIO)
  const [source, setSource] = useState<ProjectionSource | null>(null)
  const [snapshotGeneratedAt, setSnapshotGeneratedAt] = useState<string | null>(null)

  useEffect(() => {
    if (enabled && !started) setStarted(true)
  }, [enabled, started])

  useEffect(() => {
    if (!started) return
    let settled = false
    let worker: Worker | null = null
    let watchdog: ReturnType<typeof setTimeout> | undefined
    let messageErrorListener: (() => void) | null = null
    const controller = new AbortController()

    const clearWatchdog = (): void => {
      if (watchdog === undefined) return
      clearTimeout(watchdog)
      watchdog = undefined
    }

    const fail = (reason: ProjectionErrorReason): void => {
      if (settled) return
      settled = true
      clearWatchdog()
      // O `rawResult` anterior continua exposto: falha não zera o que já foi bom.
      setErrorReason(reason)
      setStatus('error')
      worker?.terminate()
    }

    const adoptSnapshot = (snapshot: ProjectionsSnapshot): void => {
      settled = true
      setRawResult(snapshot.raw)
      setErrorReason(null)
      setSource('snapshot')
      setSnapshotGeneratedAt(snapshot.generatedAt)
      setStatus('ready')
    }

    const startWorker = (): void => {
      if (typeof Worker === 'undefined') {
        fail('error')
        return
      }
      let created: Worker
      try {
        created = new Worker(new URL('./projection.worker.ts', import.meta.url), { type: 'module' })
      } catch {
        fail('error')
        return
      }
      worker = created
      setErrorReason(null)
      setStatus('loading')

      messageErrorListener = (): void => fail('error')
      watchdog = setTimeout(() => fail('timeout'), PROJECTION_TIMEOUT_MS)
      created.onmessage = (event: MessageEvent<RawProjectionResult>): void => {
        if (settled) return
        settled = true
        clearWatchdog()
        setRawResult(event.data)
        setErrorReason(null)
        setSource('worker')
        setSnapshotGeneratedAt(null)
        setStatus('ready')
        created.terminate()
      }
      created.onerror = (): void => fail('error')
      created.addEventListener('messageerror', messageErrorListener)
      created.postMessage({ type: 'run' })
    }

    /**
     * `status` fica em `loading` durante o fetch (ele é rápido, mas evita
     * flash). O artefato só é adotado quando o hash prova que ele veio do
     * mesmo pacote deste build; caso contrário é descartado com um aviso no
     * console — nunca com erro na tela.
     */
    const loadSnapshot = async (): Promise<void> => {
      const timeout = setTimeout(() => controller.abort(), SNAPSHOT_FETCH_TIMEOUT_MS)
      let adopted: ProjectionsSnapshot | null = null
      try {
        const response = await fetch(SNAPSHOT_URL, { cache: 'no-cache', signal: controller.signal })
        if (!response.ok) {
          warnSnapshotIgnored(`HTTP ${response.status}`)
        } else {
          const snapshot = parseProjectionsSnapshotEntry(await response.json())
          if (snapshot === null) {
            warnSnapshotIgnored('documento fora do contrato')
          } else {
            // Import dinâmico: `projectionInputHash` carrega os módulos de
            // partidas disputadas, que não podem entrar no chunk de boot do
            // provider — só a tentativa do caminho rápido precisa deles.
            const { computeProjectionInputHash } = await import('./projectionInputHash')
            if (snapshot.inputHash !== computeProjectionInputHash()) {
              warnSnapshotIgnored('hash de entrada divergente do pacote atual')
            } else {
              adopted = snapshot
            }
          }
        }
      } catch (error) {
        warnSnapshotIgnored(error instanceof Error ? error.message : 'falha ao ler o artefato')
      } finally {
        clearTimeout(timeout)
      }
      // Um desmonte (ou `retry`) durante o fetch não pode reabrir o fluxo.
      if (settled) return
      if (adopted) adoptSnapshot(adopted)
      else startWorker()
    }

    if (retryCount === 0) void loadSnapshot()
    else startWorker()

    return () => {
      settled = true
      clearWatchdog()
      controller.abort()
      if (worker && messageErrorListener) worker.removeEventListener('messageerror', messageErrorListener)
      worker?.terminate()
    }
  }, [started, retryCount])

  const result = useMemo(
    () => (rawResult ? deriveProjectionResult(rawResult, scenario) : null),
    [rawResult, scenario],
  )

  const value: ProjectionContextValue = {
    result,
    status,
    errorReason,
    retry: () => setRetryCount((count) => count + 1),
    scenario,
    setScenario,
    availableLines: LIBERTADORES_LINES,
    source,
    snapshotGeneratedAt,
  }
  return <ProjectionContext.Provider value={value}>{children}</ProjectionContext.Provider>
}

export function useProjection(): ProjectionContextValue {
  const value = useContext(ProjectionContext)
  if (!value) throw new Error('useProjection precisa estar dentro de ProjectionProvider.')
  return value
}

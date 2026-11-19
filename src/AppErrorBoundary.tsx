import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Quando a UI quebra, o código e os dados continuam auditáveis no repositório. */
const REPOSITORY_URL = 'https://github.com/ils15/brasileirao-2026'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

/**
 * Última linha de defesa da UI. As abas são `React.lazy`: um chunk que não
 * carrega (deploy no meio da sessão, CDN bloqueada, rede caindo) rejeita o
 * import e, sem boundary, o React desmonta a árvore inteira — tela branca.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Sem PII: só o erro e o rastro do componente que falhou.
    console.error('Falha ao renderizar o painel:', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="app-error" role="alert">
        <h1>Não foi possível carregar o painel</h1>
        <p>
          Isso costuma acontecer quando uma versão nova foi publicada enquanto você navegava ou quando a
          conexão com a rede falhou. Atualize a página para buscar a versão atual.
        </p>
        <div className="app-error__actions">
          <button className="app-error__action app-error__action--primary" type="button" onClick={() => window.location.reload()}>
            Atualizar página
          </button>
          <a className="app-error__action app-error__action--secondary" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            Ver dados no GitHub
          </a>
        </div>
      </main>
    )
  }
}

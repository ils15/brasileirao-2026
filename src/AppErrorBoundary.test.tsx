import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from './AppErrorBoundary'

/** O repositório é a rota de fuga quando a própria app não renderiza. */
const REPOSITORY_URL = 'https://github.com/ils15/brasileirao-2026'

function BrokenPanel(): never {
  throw new Error('chunk lazy indisponível')
}

describe('AppErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renderiza os filhos quando nada falha', () => {
    render(
      <AppErrorBoundary>
        <p>painel carregado</p>
      </AppErrorBoundary>,
    )

    expect(screen.getByText('painel carregado')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('troca a tela branca por um fallback acessível quando o render falha', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AppErrorBoundary>
        <BrokenPanel />
      </AppErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/não foi possível carregar o painel/i)
    expect(alert).toHaveTextContent(/versão|conexão|rede/i)
    expect(screen.queryByText('chunk lazy indisponível')).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalled()

    expect(screen.getByRole('button', { name: 'Atualizar página' })).toBeInTheDocument()

    const repositoryLink = screen.getByRole('link', { name: 'Ver dados no GitHub' })
    expect(repositoryLink).toHaveAttribute('href', REPOSITORY_URL)
    expect(repositoryLink).toHaveAttribute('target', '_blank')
    expect(repositoryLink).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  })
})

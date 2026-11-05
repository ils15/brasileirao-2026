import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildXlsx, downloadFile, toCSV, toJson, type ExportColumn } from './exporters'

const columns: ExportColumn[] = [
  { key: 'clube', header: 'Clube' },
  { key: 'pontos', header: 'Pontos, corridos' },
  { key: 'obs', header: 'Observação' },
  { key: 'ativo', header: 'Ativo' },
]

describe('exportação CSV', () => {
  it('gera BOM UTF-8, cabeçalho e linhas com escaping RFC 4180', () => {
    const csv = toCSV(columns, [
      { clube: 'Flamengo', pontos: 73, obs: null, ativo: true },
      { clube: 'São Paulo, FC', pontos: 43, obs: 'linha\nquebrada com "aspas"', ativo: false },
    ])
    expect(csv.startsWith('\uFEFF')).toBe(true)
    expect(csv).toContain('Clube,"Pontos, corridos",Observação,Ativo')
    expect(csv).toContain('Flamengo,73,,true')
    expect(csv).toContain('"São Paulo, FC",43,"linha\nquebrada com ""aspas""",false')
    // Separador de linha RFC 4180 entre as linhas de dados
    expect(csv).toContain('true\r\n"São Paulo, FC"')
  })

  it('duplica aspas internas e envolve células com vírgula, quebra ou aspas', () => {
    const csv = toCSV([{ key: 'v', header: 'V' }], [
      { v: 'simples' },
      { v: 'tem, vírgula' },
      { v: 'tem "aspas"' },
      { v: 'tem\nquebra' },
    ])
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('simples')
    expect(lines[2]).toBe('"tem, vírgula"')
    expect(lines[3]).toBe('"tem ""aspas"""')
    expect(lines[4]).toBe('"tem\nquebra"')
  })
})

describe('exportação JSON', () => {
  it('serializa payload com BOM e formatação estável', () => {
    const json = toJson({ nome: 'projeção', n: 20_000 })
    expect(json.startsWith('\uFEFF')).toBe(true)
    expect(json).toContain('"nome": "projeção"')
    expect(json).toContain('"n": 20000')
    expect(() => JSON.parse(json.replace('\uFEFF', ''))).not.toThrow()
  })
})

describe('exportação XLSX', () => {
  it('produz ZIP válido com entradas STORE, CRC-32 e estrutura de planilha', () => {
    const xlsx = buildXlsx([{ name: 'Classificação', columns, rows: [{ clube: 'Flamengo', pontos: 73, obs: 'líder & <forte>', ativo: null }] }])
    const view = new DataView(xlsx.buffer, xlsx.byteOffset, xlsx.byteLength)

    // Assinaturas ZIP: primeiro cabeçalho local, EOCD ao final.
    expect(view.getUint32(0, true)).toBe(0x04034b50)
    expect(view.getUint32(xlsx.length - 22, true)).toBe(0x06054b50)
    expect(view.getUint16(xlsx.length - 22 + 10, true)).toBe(5) // 5 entradas

    // O conteúdo da planilha está presente com escaping XML e tipos corretos.
    const text = new TextDecoder().decode(xlsx)
    expect(text).toContain('[Content_Types].xml')
    expect(text).toContain('xl/worksheets/sheet1.xml')
    expect(text).toContain('Flamengo')
    expect(text).toContain('<v>73</v>')
    expect(text).toContain('líder &amp; &lt;forte&gt;')
    expect(text).toContain('xml:space="preserve"')

    // Célula nula vira célula vazia (sem <v>).
    const nullColumn = text.indexOf('Ativo')
    expect(text.slice(nullColumn, nullColumn + 200)).not.toContain('<c r="D2"')
  })

  it('gera múltiplas planilhas com nomes seguros e referências corretas', () => {
    const xlsx = buildXlsx([
      { name: 'Resultados 2026?', columns: [{ key: 'a', header: 'A' }], rows: [{ a: 1 }] },
      { name: 'Fixt*uras', columns: [{ key: 'b', header: 'B' }], rows: [{ b: 'x' }] },
    ])
    const text = new TextDecoder().decode(xlsx)
    expect(text).toContain('name="Resultados 2026 "')
    expect(text).toContain('name="Fixt uras"')
    expect(text).toContain('xl/worksheets/sheet2.xml')
    expect(text).toContain('<c r="A2"><v>1</v></c>')
    expect(text).toContain('">x</t>')
  })

  it('usa colunas além de Z com nomes AA, AB…', () => {
    const manyColumns = Array.from({ length: 28 }, (_, index) => ({ key: `c${index}`, header: `C${index}` }))
    const xlsx = buildXlsx([{ name: 'Larga', columns: manyColumns, rows: [{ ...Object.fromEntries(manyColumns.map(({ key }) => [key, 1])) }] }])
    const text = new TextDecoder().decode(xlsx)
    expect(text).toContain('<c r="AA2"')
    expect(text).toContain('<c r="AB2"')
  })

  it('rejeita gerar XLSX sem planilhas', () => {
    expect(() => buildXlsx([])).toThrow('ao menos uma planilha')
  })

  it('é determinístico: duas chamadas produzem bytes idênticos', () => {
    const sheet = { name: 'S', columns: [{ key: 'x', header: 'X' }], rows: [{ x: 'a' }, { x: 'b' }] }
    const first = buildXlsx([sheet])
    const second = buildXlsx([sheet])
    expect(first.length).toBe(second.length)
    for (let index = 0; index < first.length; index += 1) {
      expect(first[index]).toBe(second[index])
    }
  })
})

describe('download de arquivo', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cria blob, ancora com nome de arquivo e revoga a URL', () => {
    const createObjectURL = vi.fn(() => 'blob:teste')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })
    const click = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)

    downloadFile('dados.csv', 'text/csv', 'a,b\r\n1,2\r\n')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:teste')
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe('dados.csv')
  })
})

/**
 * Exportação de dados em CSV, JSON e XLSX sem dependências externas.
 *
 * - CSV: UTF-8 com BOM (abre com acentos no Excel) e escaping RFC 4180.
 * - XLSX: arquivo .xlsx real — um ZIP com entradas STORE (sem compressão) e
 *   CRC-32 próprio, contendo a planilha mínima válida de SpreadsheetML.
 * - Downloads via Blob + createObjectURL.
 */

export type ExportValue = string | number | boolean | null
export type ExportRow = Record<string, ExportValue>
export interface ExportColumn {
  key: string
  header: string
}
export interface ExportSheet {
  name: string
  columns: ExportColumn[]
  rows: ExportRow[]
}

const UTF8_BOM = '\uFEFF'

function escapeCsvCell(value: ExportValue): string {
  const text = value === null ? '' : String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`
  return text
}

export function toCSV(columns: readonly ExportColumn[], rows: readonly ExportRow[]): string {
  const header = columns.map(({ header }) => escapeCsvCell(header)).join(',')
  const body = rows.map((row) => columns.map(({ key }) => escapeCsvCell(row[key] ?? null)).join(',')).join('\r\n')
  return `${UTF8_BOM}${header}\r\n${body}`
}

export function toJson(payload: unknown): string {
  return `${UTF8_BOM}${JSON.stringify(payload, null, 2)}`
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1)
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)) >>> 0
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function xmlEscape(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function columnName(index: number): string {
  let name = ''
  let remaining = index
  do {
    name = String.fromCharCode(65 + (remaining % 26)) + name
    remaining = Math.floor(remaining / 26) - 1
  } while (remaining >= 0)
  return name
}

function sheetCell(ref: string, value: ExportValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return `<c r="${ref}"><v>${value}</v></c>`
  if (typeof value === 'boolean') return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
}

function sheetXml({ columns, rows }: ExportSheet): string {
  const lines: string[] = []
  lines.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
  lines.push('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>')
  const headerRow = columns
    .map(({ header }, index) => sheetCell(`${columnName(index)}1`, header))
    .join('')
  lines.push(`<row r="1">${headerRow}</row>`)
  rows.forEach((row, rowIndex) => {
    const cells = columns
      .map(({ key }, columnIndex) => sheetCell(`${columnName(columnIndex)}${rowIndex + 2}`, row[key] ?? null))
      .join('')
    lines.push(`<row r="${rowIndex + 2}">${cells}</row>`)
  })
  lines.push('</sheetData></worksheet>')
  return lines.join('')
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

// Data/hora DOS fixas (1980-01-01 00:00) para arquivos determinísticos.
const DOS_TIME = 0
const DOS_DATE = 0x21

function buildZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true) // assinatura do cabeçalho local
    localView.setUint16(4, 20, true) // versão mínima
    localView.setUint16(6, 0x0800, true) // flags: nome UTF-8
    localView.setUint16(8, 0, true) // método STORE (sem compressão)
    localView.setUint16(10, DOS_TIME, true)
    localView.setUint16(12, DOS_DATE, true)
    localView.setUint32(14, crc, true)
    localView.setUint32(18, entry.data.length, true) // tamanho comprimido
    localView.setUint32(22, entry.data.length, true) // tamanho original
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true) // sem campo extra
    local.set(nameBytes, 30)
    locals.push(local, entry.data)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true) // assinatura do diretório central
    centralView.setUint16(4, 20, true) // versão do gravador
    centralView.setUint16(6, 20, true) // versão mínima para leitura
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, DOS_TIME, true)
    centralView.setUint16(14, DOS_DATE, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, entry.data.length, true)
    centralView.setUint32(24, entry.data.length, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint32(42, offset, true) // deslocamento do cabeçalho local
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length + entry.data.length
  }

  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  const centralSize = centrals.reduce((sum, central) => sum + central.length, 0)
  endView.setUint32(0, 0x06054b50, true) // assinatura EOCD
  endView.setUint16(8, entries.length, true) // entradas neste disco
  endView.setUint16(10, entries.length, true) // entradas totais
  endView.setUint32(12, centralSize, true) // tamanho do diretório central
  endView.setUint32(16, offset, true) // deslocamento do diretório central

  const totalLength = offset + centralSize + end.length
  const zip = new Uint8Array(totalLength)
  let cursor = 0
  for (const chunk of [...locals, ...centrals, end]) {
    zip.set(chunk, cursor)
    cursor += chunk.length
  }
  return zip
}

function sheetNameForIndex(index: number): string {
  return `sheet${index + 1}`
}

export function buildXlsx(sheets: readonly ExportSheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error('XLSX exige ao menos uma planilha.')
  const safeNames = sheets.map(({ name }, index) => ({ name: name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || sheetNameForIndex(index) }))
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, index) => `<Override PartName="/xl/worksheets/${sheetNameForIndex(index)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
    + '</Types>'
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>'
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<sheets>'
    + sheets.map((_, index) => `<sheet name="${xmlEscape(safeNames[index]!.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
    + '</sheets></workbook>'
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/${sheetNameForIndex(index)}.xml"/>`).join('')
    + '</Relationships>'

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: utf8Bytes(contentTypes) },
    { name: '_rels/.rels', data: utf8Bytes(rootRels) },
    { name: 'xl/workbook.xml', data: utf8Bytes(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: utf8Bytes(workbookRels) },
    ...sheets.map((sheet, index) => ({ name: `xl/worksheets/${sheetNameForIndex(index)}.xml`, data: utf8Bytes(sheetXml(sheet)) })),
  ]
  return buildZip(entries)
}

export function downloadFile(filename: string, mime: string, content: string | Uint8Array): void {
  const blob = content instanceof Uint8Array
    ? new Blob([content as BlobPart], { type: mime })
    : new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

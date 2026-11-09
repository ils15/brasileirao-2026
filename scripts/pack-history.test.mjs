import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { OPENFOOTBALL_BLOBS, auditOpenFootballSeason, parseOpenFootballSeason } from './pack-history.mjs'
import { historicalSeasons } from '../src/historicalSeasons.ts'

const snapshot = (year) => readFileSync(resolve(process.cwd(), `data/source-snapshots/openfootball-br-2003-2011/${year}.txt`), 'utf8')
const snapshotBytes = (year) => readFileSync(resolve(process.cwd(), `data/source-snapshots/openfootball-br-2003-2011/${year}.txt`))

describe('pins dos snapshots OpenFootball 2003–2011', () => {
  it('mantém blob SHA-1 e SHA-256 dos nove arquivos iguais aos fixados no pacote', () => {
    for (let year = 2003; year <= 2011; year += 1) {
      const bytes = snapshotBytes(year)
      const blobSha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      const provenance = historicalSeasons.find((season) => season.year === year)?.provenance
      expect(blobSha, `blob SHA-1 de ${year}`).toBe(OPENFOOTBALL_BLOBS[year])
      expect(provenance?.blobSha, `provenance.blobSha de ${year}`).toBe(blobSha)
      expect(provenance?.sha256, `provenance.sha256 de ${year}`).toBe(sha256)
    }
  })
})

describe('parser OpenFootball 2003–2011', () => {
  it('lê a forma de 2003 com data DD/MM/YYYY, hora e placar x', () => {
    const [match] = parseOpenFootballSeason('1ª Rodada\n29/03/2003 - Sábado\n16h00 - Guarani 4x2 Vasco - Brinco de Ouro', 2003)

    expect(match).toMatchObject({ round: 1, date: '2003-03-29', home: 'guarani', away: 'vasco', homeGoals: 4, awayGoals: 2, sourceOrdinal: 1 })
  })

  it('lê a forma de 2011 com datas sem ano e placar separado por hífens', () => {
    const [first, second] = parseOpenFootballSeason('Rodada 1\n[Sab 21/05]\nCeará 1 - 3 Vasco da Gama\n[Dom 22/05]\nPalmeira 1 - 0 Botafogo', 2011)

    expect(first).toMatchObject({ round: 1, date: '2011-05-21', home: 'ceara', away: 'vasco', homeGoals: 1, awayGoals: 3 })
    expect(second).toMatchObject({ round: 1, date: '2011-05-22', home: 'palmeiras', away: 'botafogo', homeGoals: 1, awayGoals: 0 })
    expect(first.kickoff).toBe('2011-05-21T00:00')
  })

  it('falha em clubes desconhecidos em vez de descartar placares', () => {
    expect(() => parseOpenFootballSeason('Rodada 1\n[Sab 21/05]\nClube Inventado 1 - 0 Vasco', 2011)).toThrow(/Clube histórico desconhecido.*Clube Inventado/)
  })

  it('não confunde repetição de par em rodada/data diferentes com duplicata de fixture', () => {
    const matches = parseOpenFootballSeason([
      '1ª Rodada', '23/04/2005 - Sábado', 'Paraná 0 - 2 Goiás',
      '2ª Rodada', '30/04/2005 - Sábado', 'Paraná 1 - 0 Goiás',
    ].join('\n'), 2005)

    expect(matches).toHaveLength(2)
    expect(matches.map(({ homeGoals, awayGoals }) => [homeGoals, awayGoals])).toEqual([[0, 2], [1, 0]])
  })

  it('parseia placares dos snapshots fixados em todas as nove temporadas', () => {
    const expected = new Map([[2003, [552, 24]], [2004, [552, 24]], [2005, [473, 22]], ...Array.from({ length: 6 }, (_, index) => [2006 + index, [380, 20]])])
    for (let year = 2003; year <= 2011; year += 1) {
      const matches = parseOpenFootballSeason(snapshot(year), year)
      const audit = auditOpenFootballSeason(matches, year)
      expect([matches.length, audit.clubs], `temporada ${year}`).toEqual(expected.get(year))
      expect(audit.duplicateFixtures, `fixtures repetidos em ${year}`).toEqual([])
      expect(audit.deterministicOrder, `ordem estável em ${year}`).toBe(true)
      expect(matches.every(({ date, home, away, homeGoals, awayGoals }) =>
        /^\d{4}-\d{2}-\d{2}$/.test(date) && home.length > 0 && away.length > 0
        && home !== away && Number.isInteger(homeGoals) && homeGoals >= 0
        && Number.isInteger(awayGoals) && awayGoals >= 0,
      ), `placares válidos em ${year}`).toBe(true)
    }
  })

  it('ignora placar parcial explicitamente marcado como abandono e guarda apenas a conclusão', () => {
    const matches = parseOpenFootballSeason(snapshot(2004), 2004)
    const spSaocaetano = matches.filter(({ home, away }) => new Set([home, away]).has('saopaulo') && new Set([home, away]).has('sao-caetano'))

    expect(spSaocaetano).toHaveLength(2)
    expect(spSaocaetano.some(({ date, homeGoals, awayGoals }) => date === '2004-10-27' && homeGoals === 0 && awayGoals === 0)).toBe(false)
    expect(spSaocaetano).toContainEqual(expect.objectContaining({ date: '2004-11-03', home: 'saopaulo', away: 'sao-caetano', homeGoals: 4, awayGoals: 2 }))
  })

  it('preserva os replays de 2005 em datas/rodadas diferentes sem deduplicar pares', () => {
    const matches = parseOpenFootballSeason(snapshot(2005), 2005)
    const pair = matches.filter(({ home, away }) => new Set([home, away]).has('corinthians') && new Set([home, away]).has('saopaulo'))

    expect(pair).toHaveLength(3)
    expect(auditOpenFootballSeason(matches, 2005).repeatedPairs).toHaveLength(11)
    expect(auditOpenFootballSeason(matches, 2005).duplicateFixtures).toEqual([])
  })
})

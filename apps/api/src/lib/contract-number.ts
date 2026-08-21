import type { RowDataPacket } from 'mysql2'
import type { PoolConnection } from 'mysql2/promise'
import { ApiError } from './errors.js'

const CONTRACT_NUMBER_LOCK = 'hris:employee-contract-number'

const siteSegments = {
  SEMARANG: 'RSIASMG-HR',
  KLATEN: 'RSIASLO-HR',
  JEPARA: 'RSIAKDS-HR',
} as const

const romanMonths = [
  'I',
  'II',
  'III',
  'IV',
  'V',
  'VI',
  'VII',
  'VIII',
  'IX',
  'X',
  'XI',
  'XII',
] as const

export type ContractNumberSite = keyof typeof siteSegments

export type ContractNumberParts = {
  contractType: string
  siteSegment: string
  sequence: number
  romanMonth: string
  year: number
}

function contractTypeSegment(value: string) {
  const segment = value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!segment) throw new ApiError(422, 'Jenis kontrak tidak dapat digunakan untuk nomor kontrak.')
  return segment
}

function periodParts(startDate: string) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(startDate)
  const month = Number(match?.[2])
  if (!match || month < 1 || month > 12) {
    throw new ApiError(422, 'Tanggal mulai kontrak tidak valid untuk nomor kontrak.')
  }
  return { year: Number(match[1]), romanMonth: romanMonths[month - 1] }
}

export function contractNumberSiteSegment(site: string) {
  const segment = siteSegments[site as ContractNumberSite]
  if (!segment) throw new ApiError(422, 'Site belum memiliki format nomor kontrak.')
  return segment
}

export function contractNumberSiteFromSnapshot(
  siteSnapshot: string | null | undefined,
  fallbackSite: string
) {
  const normalized = siteSnapshot?.trim().toUpperCase()
  for (const [site, segment] of Object.entries(siteSegments)) {
    if (normalized === site || normalized === `SITE ${site}` || normalized === segment) return site
  }
  contractNumberSiteSegment(fallbackSite)
  return fallbackSite
}

export function parseContractNumber(value: string): ContractNumberParts | undefined {
  const match = /^([A-Z0-9-]+)\/([A-Z0-9-]+)\/(\d+)\/([IVX]+)\/(\d{4})$/.exec(value)
  if (!match) return undefined
  const sequence = Number(match[3])
  if (!Number.isSafeInteger(sequence) || sequence < 1) return undefined
  return {
    contractType: match[1],
    siteSegment: match[2],
    sequence,
    romanMonth: match[4],
    year: Number(match[5]),
  }
}

export function formatContractNumber(
  contractType: string,
  site: string,
  sequence: number,
  startDate: string
) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new ApiError(422, 'Urutan nomor kontrak tidak valid.')
  }
  const { year, romanMonth } = periodParts(startDate)
  return `${contractTypeSegment(contractType)}/${contractNumberSiteSegment(site)}/${String(sequence).padStart(3, '0')}/${romanMonth}/${year}`
}

export function canPreserveContractNumberSequence(
  contractNumber: string,
  site: string,
  startDate: string
) {
  const parsed = parseContractNumber(contractNumber)
  if (!parsed) return undefined
  const { year, romanMonth } = periodParts(startDate)
  if (
    parsed.siteSegment !== contractNumberSiteSegment(site) ||
    parsed.romanMonth !== romanMonth ||
    parsed.year !== year
  ) return undefined
  return parsed.sequence
}

export async function acquireContractNumberLock(conn: PoolConnection) {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT GET_LOCK(?, 10) acquired',
    [CONTRACT_NUMBER_LOCK]
  )
  if (Number(rows[0]?.acquired) !== 1) {
    throw new ApiError(409, 'Nomor kontrak sedang diproses. Silakan coba kembali.')
  }
}

export async function releaseContractNumberLock(conn: PoolConnection) {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT RELEASE_LOCK(?) released',
    [CONTRACT_NUMBER_LOCK]
  )
  if (Number(rows[0]?.released) !== 1) throw new Error('Gagal melepas lock nomor kontrak.')
}

export async function nextContractNumberSequence(
  conn: PoolConnection,
  site: string,
  startDate: string
) {
  const segment = contractNumberSiteSegment(site)
  const { year, romanMonth } = periodParts(startDate)
  const suffix = `/${romanMonth}/${year}`
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT contract_number contractNumber FROM employee_contracts WHERE contract_number LIKE ?',
    [`%/${segment}/%${suffix}`]
  )
  let maximum = 0
  for (const row of rows) {
    const parsed = parseContractNumber(String(row.contractNumber))
    if (
      parsed?.siteSegment === segment &&
      parsed.romanMonth === romanMonth &&
      parsed.year === year
    ) maximum = Math.max(maximum, parsed.sequence)
  }
  return maximum + 1
}

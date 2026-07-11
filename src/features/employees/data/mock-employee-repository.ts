import type {
  Employee,
  EmployeeContract,
  EmployeeDocument,
  EmployeeInput,
  EmployeeListParams,
  EmployeeRepository,
  EmploymentHistory,
  MutationInput,
  PaginatedResult,
} from '../domain'

const STORAGE_KEY = 'hris-restu.employee-mock-v1'
const wait = () => new Promise((resolve) => window.setTimeout(resolve, 250))
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`
const clone = <T>(value: T): T => structuredClone(value)

const employees: Employee[] = [
  {
    uid: 'emp-adi-001',
    employeeNumber: 'RST-JPR-001',
    barcode: 'RSTJPR001',
    fullName: 'Adi Pratama',
    nickname: 'Adi',
    employeeType: 'BORONGAN',
    employeeStatus: 'ACTIVE',
    site: 'JEPARA',
    department: 'Produksi',
    position: 'Operator Produksi',
    workGroup: 'Kelompok A',
    joinDate: '2024-02-12',
    gender: 'MALE',
    birthPlace: 'Jepara',
    birthDate: '1998-06-14',
    maritalStatus: 'MARRIED',
    religion: 'Islam',
    city: 'Jepara',
    province: 'Jawa Tengah',
    notes: 'Data mock fiktif.',
  },
  {
    uid: 'emp-sari-002',
    employeeNumber: 'RST-SMG-014',
    barcode: 'RSTSMG014',
    fullName: 'Sari Wulandari',
    nickname: 'Sari',
    employeeType: 'BORONGAN',
    employeeStatus: 'ACTIVE',
    site: 'SEMARANG',
    department: 'Produksi',
    position: 'Quality Control',
    workGroup: 'Kelompok QC',
    joinDate: '2023-08-21',
    gender: 'FEMALE',
    birthPlace: 'Semarang',
    birthDate: '1997-09-22',
    maritalStatus: 'SINGLE',
    religion: 'Islam',
    city: 'Semarang',
    province: 'Jawa Tengah',
  },
  {
    uid: 'emp-bima-003',
    employeeNumber: 'RST-KLT-009',
    barcode: 'RSTKLT009',
    fullName: 'Bima Kurniawan',
    nickname: 'Bima',
    employeeType: 'BULANAN',
    employeeStatus: 'ACTIVE',
    site: 'KLATEN',
    department: 'Operasional',
    position: 'Supervisor Produksi',
    joinDate: '2022-01-10',
    permanentDate: '2023-01-10',
    gender: 'MALE',
    birthPlace: 'Klaten',
    birthDate: '1992-03-08',
    maritalStatus: 'MARRIED',
    religion: 'Kristen',
    city: 'Klaten',
    province: 'Jawa Tengah',
  },
  {
    uid: 'emp-rina-004',
    employeeNumber: 'RST-JPR-027',
    barcode: 'RSTJPR027',
    fullName: 'Rina Lestari',
    employeeType: 'BORONGAN',
    employeeStatus: 'LEAVE',
    site: 'JEPARA',
    department: 'Produksi',
    position: 'Operator Pengemasan',
    workGroup: 'Kelompok B',
    joinDate: '2025-01-06',
    gender: 'FEMALE',
    birthPlace: 'Pati',
    birthDate: '2000-11-11',
    maritalStatus: 'SINGLE',
    religion: 'Islam',
    city: 'Jepara',
    province: 'Jawa Tengah',
  },
  {
    uid: 'emp-dian-005',
    employeeNumber: 'RST-SMG-022',
    barcode: 'RSTSMG022',
    fullName: 'Dian Permata',
    employeeType: 'BULANAN',
    employeeStatus: 'ACTIVE',
    site: 'SEMARANG',
    department: 'HR',
    position: 'Admin HR',
    joinDate: '2023-04-03',
    gender: 'FEMALE',
    birthPlace: 'Kendal',
    birthDate: '1996-01-18',
    maritalStatus: 'MARRIED',
    religion: 'Islam',
    city: 'Semarang',
    province: 'Jawa Tengah',
  },
]
const histories: EmploymentHistory[] = employees.map((employee) => ({
  uid: `hist-${employee.uid}`,
  employeeUid: employee.uid,
  site: employee.site,
  department: employee.department,
  position: employee.position,
  workGroup: employee.workGroup,
  employeeType: employee.employeeType,
  employeeStatus: employee.employeeStatus,
  effectiveFrom: employee.joinDate,
  changeType: 'INITIAL',
  notes: 'Penempatan awal.',
}))
const contracts: EmployeeContract[] = [
  {
    uid: 'contract-001',
    employeeUid: 'emp-adi-001',
    contractNumber: 'PKWT/JPR/2025/001',
    contractType: 'PKWT',
    sequenceNumber: 2,
    startDate: '2025-02-12',
    endDate: '2026-02-11',
    signedDate: '2025-02-10',
    status: 'ACTIVE',
    positionNameSnapshot: 'Operator Produksi',
    siteNameSnapshot: 'Site Jepara',
  },
  {
    uid: 'contract-002',
    employeeUid: 'emp-sari-002',
    contractNumber: 'PKWT/SMG/2025/014',
    contractType: 'PKWT',
    sequenceNumber: 2,
    startDate: '2025-08-21',
    endDate: '2026-08-20',
    signedDate: '2025-08-18',
    status: 'ACTIVE',
    positionNameSnapshot: 'Quality Control',
    siteNameSnapshot: 'Site Semarang',
  },
]
const documents: EmployeeDocument[] = [
  {
    uid: 'doc-001',
    employeeUid: 'emp-adi-001',
    documentType: 'KTP',
    documentNumber: '••••••••••••1234',
    name: 'Identitas Karyawan',
    issuedDate: '2024-02-12',
    status: 'ACTIVE',
    file: {
      uid: 'file-001',
      originalName: 'ktp-adi.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 220000,
      extension: 'pdf',
    },
  },
  {
    uid: 'doc-002',
    employeeUid: 'emp-sari-002',
    documentType: 'Sertifikat',
    name: 'Sertifikat Keselamatan Kerja',
    issuedDate: '2025-03-12',
    expiryDate: '2026-03-11',
    status: 'ACTIVE',
    file: {
      uid: 'file-002',
      originalName: 'sertifikat-sari.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 180000,
      extension: 'pdf',
    },
  },
]

type State = {
  employees: Employee[]
  histories: EmploymentHistory[]
  contracts: EmployeeContract[]
  documents: EmployeeDocument[]
}
const initialState: State = { employees, histories, contracts, documents }
function read(): State {
  if (typeof window === 'undefined') return clone(initialState)
  const value = window.sessionStorage.getItem(STORAGE_KEY)
  if (!value) return clone(initialState)
  try {
    return JSON.parse(value) as State
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return clone(initialState)
  }
}
function write(state: State) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}
function assertUnique(state: State, input: EmployeeInput, currentUid?: string) {
  const duplicate = state.employees.find(
    (item) =>
      item.uid !== currentUid &&
      (item.employeeNumber.toLowerCase() ===
        input.employeeNumber.toLowerCase() ||
        item.barcode.toLowerCase() === input.barcode.toLowerCase())
  )
  if (duplicate) throw new Error('Nomor karyawan atau barcode sudah digunakan.')
}

export const mockEmployeeRepository: EmployeeRepository = {
  async list(params: EmployeeListParams) {
    await wait()
    if (params.mockState === 'error')
      throw new Error('Layanan mock karyawan sedang mensimulasikan kegagalan.')
    const {
      query = '',
      site = 'ALL',
      employeeType = 'ALL',
      employeeStatus = 'ALL',
      page = 1,
      pageSize = 10,
    } = params
    const normalized = query.toLowerCase()
    const filtered = (
      params.mockState === 'empty' ? [] : read().employees
    ).filter(
      (item) =>
        (site === 'ALL' ||
          (Array.isArray(site)
            ? site.includes(item.site)
            : item.site === site)) &&
        (employeeType === 'ALL' ||
          (Array.isArray(employeeType)
            ? employeeType.includes(item.employeeType)
            : item.employeeType === employeeType)) &&
        (employeeStatus === 'ALL' ||
          (Array.isArray(employeeStatus)
            ? employeeStatus.includes(item.employeeStatus)
            : item.employeeStatus === employeeStatus)) &&
        (!normalized ||
          `${item.fullName} ${item.employeeNumber} ${item.barcode}`
            .toLowerCase()
            .includes(normalized))
    )
    return {
      items: clone(filtered.slice((page - 1) * pageSize, page * pageSize)),
      total: filtered.length,
      page,
      pageSize,
    } satisfies PaginatedResult<Employee>
  },
  async getByUid(employeeUid) {
    await wait()
    return clone(
      read().employees.find((item) => item.uid === employeeUid) ?? null
    )
  },
  async save(input, currentUid) {
    await wait()
    const state = read()
    assertUnique(state, input, currentUid)
    if (input.resignDate && input.resignDate < input.joinDate)
      throw new Error('Tanggal resign tidak boleh sebelum tanggal bergabung.')
    const current = currentUid
      ? state.employees.find((item) => item.uid === currentUid)
      : undefined
    if (currentUid && !current) throw new Error('Karyawan tidak ditemukan.')
    const employee = {
      ...input,
      ...(current
        ? {
            employeeType: current.employeeType,
            employeeStatus: current.employeeStatus,
            site: current.site,
            department: current.department,
            position: current.position,
            workGroup: current.workGroup,
          }
        : {}),
      uid: currentUid ?? uid('emp'),
    }
    if (currentUid)
      state.employees = state.employees.map((item) =>
        item.uid === currentUid ? employee : item
      )
    else {
      state.employees.push(employee)
      state.histories.push({
        uid: uid('hist'),
        employeeUid: employee.uid,
        site: employee.site,
        department: employee.department,
        position: employee.position,
        workGroup: employee.workGroup,
        employeeType: employee.employeeType,
        employeeStatus: employee.employeeStatus,
        effectiveFrom: employee.joinDate,
        changeType: 'INITIAL',
        notes: 'Penempatan awal dari pembuatan karyawan.',
      })
    }
    write(state)
    return clone(employee)
  },
  async histories(employeeUid) {
    await wait()
    return clone(
      read()
        .histories.filter(
          (item) => !employeeUid || item.employeeUid === employeeUid
        )
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
    )
  },
  async applyMutation(employeeUid, input: MutationInput) {
    await wait()
    const state = read()
    const employee = state.employees.find((item) => item.uid === employeeUid)
    if (!employee) throw new Error('Karyawan tidak ditemukan.')
    const active = state.histories.find(
      (item) => item.employeeUid === employeeUid && !item.effectiveTo
    )
    if (active && input.effectiveFrom <= active.effectiveFrom)
      throw new Error(
        'Tanggal efektif harus setelah tanggal mulai histori aktif.'
      )
    if (active) active.effectiveTo = previousDate(input.effectiveFrom)
    const history: EmploymentHistory = {
      uid: uid('hist'),
      employeeUid,
      ...input,
    }
    state.histories.push(history)
    Object.assign(employee, {
      site: input.site,
      department: input.department,
      position: input.position,
      workGroup: input.workGroup,
      employeeType: input.employeeType,
      employeeStatus: input.employeeStatus,
      resignDate:
        input.employeeStatus === 'RESIGNED' ? input.effectiveFrom : undefined,
      resignReason:
        input.employeeStatus === 'RESIGNED' ? input.reason : undefined,
    })
    write(state)
    return clone(history)
  },
  async contracts(employeeUid) {
    await wait()
    return clone(
      read()
        .contracts.filter(
          (item) => !employeeUid || item.employeeUid === employeeUid
        )
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
    )
  },
  async saveContract(input, contractUid) {
    await wait()
    if (input.endDate && input.endDate < input.startDate)
      throw new Error(
        'Tanggal berakhir kontrak tidak boleh sebelum tanggal mulai.'
      )
    const state = read()
    if (!state.employees.some((item) => item.uid === input.employeeUid))
      throw new Error('Karyawan tidak ditemukan.')
    if (input.sequenceNumber < 1) throw new Error('Urutan kontrak minimal 1.')
    if (
      contractUid &&
      !state.contracts.some((item) => item.uid === contractUid)
    )
      throw new Error('Kontrak tidak ditemukan.')
    if (
      state.contracts.some(
        (item) =>
          item.uid !== contractUid &&
          item.contractNumber === input.contractNumber
      )
    )
      throw new Error('Nomor kontrak sudah digunakan.')
    const contract = { ...input, uid: contractUid ?? uid('contract') }
    state.contracts = contractUid
      ? state.contracts.map((item) =>
          item.uid === contractUid ? contract : item
        )
      : [...state.contracts, contract]
    write(state)
    return clone(contract)
  },
  async documents(employeeUid) {
    await wait()
    return clone(
      read()
        .documents.filter(
          (item) => !employeeUid || item.employeeUid === employeeUid
        )
        .sort((a, b) =>
          (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')
        )
    )
  },
  async saveDocument(input, documentUid) {
    await wait()
    if (
      input.expiryDate &&
      input.issuedDate &&
      input.expiryDate < input.issuedDate
    )
      throw new Error('Tanggal kedaluwarsa tidak boleh sebelum tanggal terbit.')
    const state = read()
    if (!state.employees.some((item) => item.uid === input.employeeUid))
      throw new Error('Karyawan tidak ditemukan.')
    if (
      documentUid &&
      !state.documents.some((item) => item.uid === documentUid)
    )
      throw new Error('Dokumen tidak ditemukan.')
    const document = { ...input, uid: documentUid ?? uid('doc') }
    state.documents = documentUid
      ? state.documents.map((item) =>
          item.uid === documentUid ? document : item
        )
      : [...state.documents, document]
    write(state)
    return clone(document)
  },
  async reset() {
    await wait()
    window.sessionStorage.removeItem(STORAGE_KEY)
  },
}

function previousDate(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() - 1)
  return date.toISOString().slice(0, 10)
}

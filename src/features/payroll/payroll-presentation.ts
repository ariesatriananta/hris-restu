import type {
  PayrollEmployeeType,
  PayrollPayFrequency,
  PayrollRunSummary,
  PayrollWageBasis,
} from './domain'
import { addDecimalStrings } from './money'

export interface PayrollScheme {
  payrollBasis?: PayrollWageBasis
  payFrequency?: PayrollPayFrequency
  employeeType?: PayrollEmployeeType
}

export function payrollSchemeName(scheme: PayrollScheme) {
  if (scheme.payrollBasis !== 'TIME_BASED') return 'Borongan mingguan'
  if (scheme.payFrequency === 'MONTHLY' || scheme.employeeType === 'BULANAN') {
    return 'Bulanan'
  }
  return scheme.employeeType === 'TRAINING'
    ? 'Training mingguan'
    : 'Harian mingguan'
}

export function payrollBaseLabel(scheme: PayrollScheme) {
  if (scheme.payrollBasis !== 'TIME_BASED') return 'Hasil produksi'
  return scheme.payFrequency === 'MONTHLY' || scheme.employeeType === 'BULANAN'
    ? 'Gaji pokok prorata'
    : 'Upah harian'
}

export function payrollBaseAmount(
  run: Pick<
    PayrollRunSummary,
    | 'totalPieceRateAmount'
    | 'totalBasicSalaryAmount'
    | 'totalProratedBasicSalary'
  >,
  scheme: PayrollScheme
) {
  if (scheme.payrollBasis !== 'TIME_BASED') return run.totalPieceRateAmount
  if (scheme.payFrequency === 'MONTHLY' || scheme.employeeType === 'BULANAN') {
    return run.totalProratedBasicSalary ?? run.totalBasicSalaryAmount ?? '0'
  }
  return run.totalBasicSalaryAmount ?? '0'
}

export function payrollGrossAmount(
  run: Pick<
    PayrollRunSummary,
    | 'totalPieceRateAmount'
    | 'totalBasicSalaryAmount'
    | 'totalProratedBasicSalary'
    | 'totalEarnings'
    | 'totalGrossEarnings'
  >,
  scheme: PayrollScheme
) {
  return (
    run.totalGrossEarnings ??
    addDecimalStrings(payrollBaseAmount(run, scheme), run.totalEarnings)
  )
}

export function employeeBaseLabel(scheme: PayrollScheme) {
  return scheme.payrollBasis === 'TIME_BASED'
    ? scheme.payFrequency === 'MONTHLY' || scheme.employeeType === 'BULANAN'
      ? 'Gaji pokok prorata'
      : 'Upah hari hadir'
    : 'Hasil produksi'
}

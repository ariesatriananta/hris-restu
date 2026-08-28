export function isPositivePayrollAmount(value: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(value) && !/^0+(?:\.0+)?$/.test(value)
}

export function isValidPayrollAuditReason(value: string) {
  return value.trim().length >= 5
}

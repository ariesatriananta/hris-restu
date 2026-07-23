import type { EmployeeTypeCode, MutationChangeType } from './domain'

export const selectableMutationChangeTypes = [
  'TRANSFER',
  'PROMOTION',
  'DEMOTION',
  'DEPARTMENT_CHANGE',
  'TYPE_CHANGE',
  'PRODUCTION_ASSIGNMENT_CHANGE',
] as const satisfies readonly MutationChangeType[]

export type MutationEditableField =
  | 'site'
  | 'department'
  | 'position'
  | 'employeeType'
  | 'productionAssignment'

export function requiresProductionAssignment(employeeType: EmployeeTypeCode) {
  return employeeType === 'BORONGAN' || employeeType === 'TRAINING'
}

export function editableMutationFields(
  changeType: MutationChangeType,
  employeeType: EmployeeTypeCode
) {
  const fields = new Set<MutationEditableField>()

  if (changeType === 'TRANSFER') {
    fields.add('site')
    fields.add('department')
    if (requiresProductionAssignment(employeeType)) {
      fields.add('productionAssignment')
    }
  }
  if (changeType === 'PROMOTION' || changeType === 'DEMOTION') {
    fields.add('position')
  }
  if (changeType === 'DEPARTMENT_CHANGE') fields.add('department')
  if (changeType === 'TYPE_CHANGE') {
    fields.add('employeeType')
    if (requiresProductionAssignment(employeeType)) {
      fields.add('productionAssignment')
    }
  }
  if (changeType === 'PRODUCTION_ASSIGNMENT_CHANGE') {
    fields.add('productionAssignment')
  }

  return fields
}

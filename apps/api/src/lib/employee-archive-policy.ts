// Recognize the approved import only. Ordinary nonactive registrations must
// continue through onboarding; imported ACTIVE workers are operational too.
export const klatenLegacySourceHash = 'f5b8dd224012b1f3f439e8bbed65f15146784ef2e0ec0b7e14a8af28fdf55afc'
export function legacyImportSql(employee = 'e') {
  return `COALESCE(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(${employee}.notes),${employee}.notes,'{}'),'$.legacyImport.sourceHash')),'')='${klatenLegacySourceHash}'`
}
export function legacyArchiveOriginSql(employee = 'e') {
  return `(${legacyImportSql(employee)} AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(${employee}.notes),${employee}.notes,'{}'),'$.legacyImport.raw."12:STATUS (Aktif/Tidak Aktif)"')),'') IN ('NON AKTIF','RESIGN'))`
}
// Exemption is ONLY from incomplete-onboarding reminders with no live workflow.
// Do not use this predicate to remove historical transactions or real conflicts.
export function actionableEmployeeSql(employee = 'e', type = 'et', status = 'es') {
  return `(${type}.code IN ('BORONGAN','HARIAN','BULANAN','TRAINING') AND NOT (
    ${status}.code IN ('INACTIVE','RESIGNED') AND ${legacyArchiveOriginSql(employee)}
    AND NOT EXISTS(SELECT 1 FROM employee_contracts archive_workflow
      WHERE archive_workflow.employee_id=${employee}.id AND archive_workflow.status<>'CANCELLED')
  ))`
}
export function isLegacyImport(notes: unknown): boolean {
  return parsedNotes(notes)?.legacyImport?.sourceHash === klatenLegacySourceHash
}
function parsedNotes(notes: unknown): { legacyImport?: { sourceHash?: string; raw?: Record<string,string> }; operationalNotes?: string } | undefined {
  try { return typeof notes === 'string' ? JSON.parse(notes) : typeof notes === 'object' && notes !== null ? notes : undefined } catch { return undefined }
}
export function employeeNotesForDisplay(notes: unknown) {
  const parsed = parsedNotes(notes)
  return parsed?.legacyImport ? parsed.operationalNotes ?? null : notes
}
// Never accept legacy provenance supplied by a normal API caller.
export function employeeNoteInput(notes: unknown): string | null {
  const displayed = employeeNotesForDisplay(notes)
  if (parsedNotes(displayed)?.legacyImport) return null
  return typeof displayed === 'string' && displayed.trim() ? displayed : null
}

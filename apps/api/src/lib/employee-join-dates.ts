// A Borongan employee may use the start of the Borong phase as join_date.
// Keep the earlier Training phase; ordinary registration still requires joinDate.
export function employeeJoinDateIssue(input: {
  employeeType: string
  joinDate: string
  joinDateTraining?: string | null
  joinDateBorong?: string | null
}): { field: 'joinDateTraining' | 'joinDateBorong'; message: string } | undefined {
  const { employeeType, joinDate, joinDateTraining: training, joinDateBorong: borong } = input
  if (training && borong && training > borong) {
    return { field: 'joinDateBorong', message: 'Tanggal join borong tidak boleh sebelum tanggal join training.' }
  }
  if (borong && borong < joinDate) {
    return { field: 'joinDateBorong', message: 'Tanggal join borong tidak boleh sebelum tanggal bergabung.' }
  }
  if (training && training < joinDate && !(employeeType === 'BORONGAN' && borong === joinDate)) {
    return { field: 'joinDateTraining', message: 'Tanggal join training sebelum tanggal bergabung hanya berlaku jika tanggal bergabung Borongan sama dengan tanggal join borong.' }
  }
}

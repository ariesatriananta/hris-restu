export function contractLifecycleErrorMessage(error: unknown) {
  return (
    (error as { response?: { data?: { message?: string } } }).response?.data
      ?.message ?? 'Lifecycle kontrak gagal diproses.'
  )
}

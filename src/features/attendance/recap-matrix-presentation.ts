export function abnormalReasonLabel(reason: string) {
  return (
    {
      MISSING_CLOCK_IN: 'Jam masuk belum tersedia',
      MISSING_CLOCK_OUT: 'Jam pulang belum tersedia',
    }[reason] ?? reason.split('_').join(' ').toLowerCase()
  )
}

export function timeLabel(value?: string | null) {
  if (!value) return '—'
  const time = value.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1]
  return time ?? value.slice(0, 5)
}

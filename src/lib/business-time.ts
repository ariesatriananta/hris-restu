/** API timestamp inputs must carry Z or an explicit offset; calendar dates stay dates. */
export function formatWibDateTime(
  value: string,
  timeStyle: 'short' | 'medium' = 'short'
) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle,
    timeZone: 'Asia/Jakarta',
  }).format(date)
}

import type { ProductionQcSnapshot } from './domain'

export function ProductionQcDetail({
  qc,
  linting = true,
  showPayHint = true,
}: {
  qc: ProductionQcSnapshot
  linting?: boolean
  showPayHint?: boolean
}) {
  if (!linting)
    return (
      <section
        className='rounded-lg border p-3 text-sm'
        aria-label='Brand hasil produksi'
      >
        <p className='text-xs text-muted-foreground'>Brand</p>
        <p className='mt-1 font-medium break-words'>
          {qc.brand?.name ?? 'Belum dicatat'}
        </p>
      </section>
    )
  const total = qc.defects.reduce((sum, defect) => sum + defect.quantity, 0)
  const grams = (value: string | null) =>
    value === null
      ? 'Belum dicatat'
      : `${Number(value).toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`
  return (
    <section
      className='space-y-3 rounded-lg border p-3 text-sm'
      aria-label='QC hasil Linting'
    >
      <div>
        <h3 className='font-semibold'>QC Hasil Linting</h3>
        {showPayHint && (
          <p className='mt-0.5 text-xs text-muted-foreground'>
            Informasi kualitas saat setoran dicatat. Tidak mengurangi hasil
            setor atau upah.
          </p>
        )}
      </div>
      <dl className='grid grid-cols-2 gap-3'>
        <div className='col-span-2 min-w-0'>
          <dt className='text-xs text-muted-foreground'>Brand</dt>
          <dd className='mt-0.5 font-medium break-words'>
            {qc.brand?.name ?? 'Belum dicatat'}
          </dd>
        </div>
        <div>
          <dt className='text-xs text-muted-foreground'>Berat 1 (sampel)</dt>
          <dd className='mt-0.5 font-medium'>{grams(qc.weight1Grams)}</dd>
        </div>
        <div>
          <dt className='text-xs text-muted-foreground'>Berat 2 (sampel)</dt>
          <dd className='mt-0.5 font-medium'>{grams(qc.weight2Grams)}</dd>
        </div>
      </dl>
      {!!qc.defects.length && (
        <div className='grid grid-cols-2 gap-2 border-t pt-3'>
          {qc.defects.map((defect) => (
            <div
              key={defect.uid}
              className='flex min-w-0 items-start justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5'
            >
              <span className='text-xs break-words text-muted-foreground'>
                {defect.name}
              </span>
              <span className='shrink-0 text-xs font-medium tabular-nums'>
                {defect.quantity.toLocaleString('id-ID')}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className='flex items-center justify-between border-t pt-2 text-xs'>
        <span className='text-muted-foreground'>
          Total defect (bukan jumlah batang reject)
        </span>
        <span className='ml-2 font-semibold tabular-nums'>
          {total.toLocaleString('id-ID')}
        </span>
      </div>
    </section>
  )
}

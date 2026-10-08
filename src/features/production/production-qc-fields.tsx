import { useId, useState } from 'react'
import { ClipboardCheck, Minus, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { ProductionQcOptions } from './domain'
import {
  validateQcWeight,
  maskQcWeight,
  formatQcWeight,
  type ProductionQcDraft,
} from './production-qc-form-policy'

export function ProductionQcFields({
  value,
  options,
  onChange,
  disabled,
  loading,
  error,
  onRetry,
  quantity = '',
}: {
  value: ProductionQcDraft
  options?: ProductionQcOptions
  onChange: (value: ProductionQcDraft) => void
  disabled?: boolean
  loading?: boolean
  error?: boolean
  onRetry?: () => void
  quantity?: string
}) {
  const id = useId()
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const pcs = Number(quantity.replace(',', '.')) || 0
  const total = (options?.defects ?? []).reduce(
    (sum, item) => sum + (Number(value.defects[item.uid]) || 0),
    0
  )
  return (
    <section
      className='space-y-2 rounded-lg border p-2.5 sm:p-3'
      aria-label='QC hasil Linting'
    >
      <div className='flex flex-wrap items-center justify-between gap-1.5'>
        <div className='flex items-center gap-2'>
          <ClipboardCheck className='size-4 text-primary' />
          <h3 className='text-sm font-semibold'>QC Hasil Linting</h3>
        </div>
      </div>
      {loading ? (
        <p role='status' className='text-sm text-muted-foreground'>
          Memuat brand dan defect...
        </p>
      ) : error ? (
        <div role='alert' className='text-sm text-destructive'>
          Opsi QC gagal dimuat.{' '}
          {onRetry && (
            <Button type='button' variant='outline' size='sm' onClick={onRetry}>
              Coba lagi
            </Button>
          )}
        </div>
      ) : !options?.brands.length ? (
        <p role='alert' className='rounded-lg bg-muted p-3 text-sm'>
          Brand aktif untuk site ini belum tersedia. Hubungi pengelola master
          Brand Produksi sebelum menyimpan setoran Linting.
        </p>
      ) : (
        <>
          <div className='grid gap-1'>
            <Label id={`${id}-brand-label`}>
              Brand <span aria-hidden='true'>*</span>
            </Label>
            <RadioGroup
              aria-labelledby={`${id}-brand-label`}
              aria-required='true'
              className='grid grid-cols-3 gap-1.5'
              value={value.brandUid}
              onValueChange={(brandUid) => onChange({ ...value, brandUid })}
              disabled={disabled}
            >
              {options.brands.map((item) => (
                <Label
                  key={item.uid}
                  htmlFor={`${id}-brand-${item.uid}`}
                  className={`min-h-10 min-w-0 cursor-pointer gap-2 rounded-md border px-2.5 py-1.5 text-xs leading-snug has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5 ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
                >
                  <RadioGroupItem
                    id={`${id}-brand-${item.uid}`}
                    value={item.uid}
                  />
                  <span className='min-w-0 truncate' title={item.name}>
                    {item.name}
                  </span>
                </Label>
              ))}
            </RadioGroup>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            {(['weight1', 'weight2'] as const).map((key, index) => (
              <div key={key} className='grid min-w-0 gap-1'>
                <Label htmlFor={`${id}-${key}`}>
                  Berat {index + 1} (gram) *
                </Label>
                <Input
                  id={`${id}-${key}`}
                  className='h-10 min-w-0'
                  inputMode='decimal'
                  autoComplete='off'
                  placeholder='00,00'
                  value={value[key]}
                  disabled={disabled}
                  required
                  aria-invalid={Boolean(
                    touched[key] && !validateQcWeight(value[key])
                  )}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      [key]: maskQcWeight(event.target.value),
                    })
                  }
                  onFocus={(event) => {
                    if (/^0+(?:[.,]0*)?$/.test(event.target.value))
                      onChange({ ...value, [key]: '' })
                  }}
                  onBlur={(event) => {
                    setTouched((previous) => ({ ...previous, [key]: true }))
                    onChange({
                      ...value,
                      [key]: formatQcWeight(maskQcWeight(event.target.value)),
                    })
                  }}
                />
              </div>
            ))}
          </div>
          {!!options.defects.length && (
            <>
              <div className='flex justify-between gap-2 text-sm'>
                <p className='font-medium'>Detail Defect</p>
              </div>
              <div
                className='grid grid-cols-2 gap-1.5'
                data-testid='qc-defects-grid'
              >
                {options.defects.map((item, index) => (
                  <div
                    key={item.uid}
                    className={`grid min-w-0 gap-1 rounded-md border px-2 py-1.5 ${Math.floor(index / 2) % 2 === 0 ? 'bg-primary/5' : 'bg-muted/20'}`}
                  >
                    <Label
                      htmlFor={`${id}-${item.uid}`}
                      className='min-w-0 flex-1 text-xs leading-snug break-words'
                    >
                      {item.name}
                    </Label>
                    <div className='flex min-w-0 items-center justify-center gap-0'>
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        className='size-8 shrink-0 rounded-r-none'
                        aria-label={`Kurangi ${item.name}`}
                        disabled={
                          disabled || !(Number(value.defects[item.uid]) > 0)
                        }
                        onClick={() =>
                          onChange({
                            ...value,
                            defects: {
                              ...value.defects,
                              [item.uid]: String(
                                Math.max(
                                  0,
                                  (Number(value.defects[item.uid]) || 0) - 1
                                )
                              ),
                            },
                          })
                        }
                      >
                        <Minus className='size-3.5' />
                      </Button>
                      <Input
                        id={`${id}-${item.uid}`}
                        className='h-8 w-10 min-w-0 shrink-0 rounded-none border-x-0 px-1 text-center'
                        inputMode='numeric'
                        autoComplete='off'
                        value={value.defects[item.uid] ?? '0'}
                        disabled={disabled}
                        onFocus={(event) => {
                          if (event.target.value === '0') {
                            onChange({
                              ...value,
                              defects: { ...value.defects, [item.uid]: '' },
                            })
                          }
                        }}
                        onBlur={(event) => {
                          if (!event.target.value.trim()) {
                            onChange({
                              ...value,
                              defects: { ...value.defects, [item.uid]: '0' },
                            })
                          }
                        }}
                        onChange={(event) =>
                          onChange({
                            ...value,
                            defects: {
                              ...value.defects,
                              [item.uid]: event.target.value,
                            },
                          })
                        }
                      />
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        className='size-8 shrink-0 rounded-l-none'
                        aria-label={`Tambah ${item.name}`}
                        disabled={
                          disabled ||
                          Number(value.defects[item.uid]) >= 4294967295
                        }
                        onClick={() =>
                          onChange({
                            ...value,
                            defects: {
                              ...value.defects,
                              [item.uid]: String(
                                Math.min(
                                  4294967295,
                                  Math.max(
                                    0,
                                    Number(value.defects[item.uid]) || 0
                                  ) + 1
                                )
                              ),
                            },
                          })
                        }
                      >
                        <Plus className='size-3.5' />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          <dl
            className='grid grid-cols-3 gap-1 rounded-lg border border-primary/15 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/5 px-2 py-2 text-center'
            aria-label='Ringkasan hasil setoran'
          >
            {[
              [
                'Net Batang',
                (pcs - total).toLocaleString('id-ID', {
                  maximumFractionDigits: 2,
                }),
              ],
              ['Total Reject', total.toLocaleString('id-ID')],
              [
                'Gendel',
                (pcs / 20).toLocaleString('id-ID', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
              ],
            ].map(([label, number]) => (
              <div key={label} className='min-w-0'>
                <dt className='text-[11px] text-muted-foreground'>{label}</dt>
                <dd className='text-sm font-semibold tabular-nums'>{number}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  )
}

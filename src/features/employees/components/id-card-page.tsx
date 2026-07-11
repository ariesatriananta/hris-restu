import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CreditCard, RefreshCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Main } from '@/components/layout/main'
import { useEmployee, useEmployeeList } from '../data/queries'
import { EmployeeIdCard } from './id-card'

export function IdCardPage({ employeeUid }: { employeeUid?: string }) {
  const [query, setQuery] = useState('')
  const list = useEmployeeList({ page: 1, pageSize: 100 })
  const firstUid = list.data?.items[0]?.uid
  const selectedUid = employeeUid ?? firstUid ?? ''
  const selected = useEmployee(selectedUid)
  const filtered =
    list.data?.items.filter((employee) =>
      `${employee.fullName} ${employee.employeeNumber} ${employee.barcode}`
        .toLowerCase()
        .includes(query.toLowerCase())
    ) ?? []

  return (
    <Main>
      <div className='mb-6'>
        <h1 className='text-2xl font-bold'>Cetak ID Card</h1>
        <p className='text-muted-foreground'>
          Preview Code128 siap pindai untuk kartu identitas karyawan.
        </p>
      </div>
      {list.isPending ? (
        <p className='py-12 text-center text-muted-foreground'>
          Memuat daftar karyawan...
        </p>
      ) : list.isError ? (
        <div className='py-12 text-center'>
          <p>Daftar karyawan gagal dimuat.</p>
          <Button
            variant='outline'
            className='mt-3'
            onClick={() => list.refetch()}
          >
            <RefreshCcw /> Coba lagi
          </Button>
        </div>
      ) : (
        <div className='grid gap-5 lg:grid-cols-[300px_1fr]'>
          <Card>
            <CardContent className='space-y-3 p-4'>
              <div className='relative'>
                <Search className='absolute top-2.5 left-3 size-4 text-muted-foreground' />
                <Input
                  className='pl-9'
                  placeholder='Cari karyawan...'
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className='max-h-[60svh] space-y-2 overflow-y-auto'>
                {filtered.length ? (
                  filtered.map((employee) => (
                    <Link
                      key={employee.uid}
                      to='/karyawan/cetak-id-card'
                      search={{ employeeUid: employee.uid }}
                      className={`block w-full rounded-md p-3 text-left text-sm hover:bg-muted ${selectedUid === employee.uid ? 'bg-primary text-primary-foreground hover:bg-primary' : ''}`}
                    >
                      <span className='block font-semibold'>
                        {employee.fullName}
                      </span>
                      <span className='text-xs opacity-80'>
                        {employee.employeeNumber} · {employee.site}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className='py-8 text-center text-sm text-muted-foreground'>
                    Tidak ada karyawan yang sesuai.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4 sm:p-6'>
              {selected.isPending ? (
                <p className='py-12 text-center text-muted-foreground'>
                  Menyiapkan ID card...
                </p>
              ) : selected.isError ? (
                <div className='py-12 text-center'>
                  <p>ID card gagal disiapkan.</p>
                  <Button
                    variant='outline'
                    className='mt-3'
                    onClick={() => selected.refetch()}
                  >
                    <RefreshCcw /> Coba lagi
                  </Button>
                </div>
              ) : selected.data ? (
                <EmployeeIdCard employee={selected.data} />
              ) : (
                <div className='py-12 text-center text-muted-foreground'>
                  <CreditCard className='mx-auto mb-2' />
                  Pilih karyawan untuk melihat ID card.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </Main>
  )
}

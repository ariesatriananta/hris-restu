import { ArrowRight, CheckCircle2, Construction } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { modulePages, type ModulePath } from './module-pages'

export function ModulePlaceholder({ path }: { path: ModulePath }) {
  const page = modulePages[path]
  return (
    <Main>
      <div className='mb-6 max-w-3xl space-y-2'>
        <Badge
          variant='outline'
          className='gap-1.5 border-warning/40 bg-warning/10 text-warning-foreground'
        >
          <Construction className='size-3.5' /> Akan dikembangkan pada tahap
          berikutnya
        </Badge>
        <p className='text-sm font-medium text-primary'>{page.group}</p>
        <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
          {page.title}
        </h1>
        <p className='text-muted-foreground'>{page.description}</p>
      </div>
      <Card className='max-w-3xl'>
        <CardHeader>
          <CardTitle className='text-base'>Cakupan yang disiapkan</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className='grid gap-3 sm:grid-cols-2'>
            {page.features.map((feature) => (
              <li
                key={feature}
                className='flex items-start gap-2 rounded-lg border p-3 text-sm'
              >
                <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-positive' />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <div className='mt-5 flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground'>
            <ArrowRight className='size-4 shrink-0 text-primary' />
            Route dan shell sudah aktif; logika bisnis belum diimplementasikan
            pada Eksekusi 1.
          </div>
        </CardContent>
      </Card>
    </Main>
  )
}

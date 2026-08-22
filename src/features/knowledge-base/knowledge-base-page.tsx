import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  BookOpenText,
  BriefcaseBusiness,
  CalendarCheck2,
  ClipboardList,
  Factory,
  FileCog,
  FileText,
  GitBranchPlus,
  Landmark,
  LayoutGrid,
  UsersRound,
} from 'lucide-react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Main } from '@/components/layout/main'
import attendanceOverview from '../../../docs/KBASE_ATTENDANCE.md?raw'
import payrollOverview from '../../../docs/KBASE_PAYROLL.md?raw'
import attendanceOperations from '../../../docs/kbase/attendance/KBASE_OPERASIONAL_HARIAN_ATTENDANCE.md?raw'
import attendanceSettings from '../../../docs/kbase/attendance/KBASE_PENGATURAN_ATTENDANCE.md?raw'
import attendanceRecap from '../../../docs/kbase/attendance/KBASE_REKAP_ATTENDANCE.md?raw'
import employeeMaster from '../../../docs/kbase/karyawan/KBASE_MASTER_KARYAWAN.md?raw'
import employeeContracts from '../../../docs/kbase/karyawan/KBASE_PENGELOLAAN_KONTRAK.md?raw'
import employeeMutations from '../../../docs/kbase/karyawan/KBASE_PENGELOLAAN_MUTASI.md?raw'
import productionMaster from '../../../docs/kbase/production/KBASE_MASTER_PRODUKSI.md?raw'
import productionRecap from '../../../docs/kbase/production/KBASE_REKAP_PRODUKSI.md?raw'
import productionTransactions from '../../../docs/kbase/production/KBASE_TRANSAKSI_SETORAN_PRODUKSI.md?raw'
import type { KnowledgeArticle } from './domain'

type ArticleDefinition = {
  value: KnowledgeArticle
  group: 'Karyawan' | 'Attendance' | 'Produksi Borongan' | 'Payroll'
  label: string
  description: string
  icon: React.ElementType
  sourceName: string
  content: string
  status: 'Aktif' | 'Kerangka'
}

const articles: ArticleDefinition[] = [
  {
    value: 'karyawan-master',
    group: 'Karyawan',
    label: 'Master Karyawan',
    description: 'Tambah, periksa, ubah, impor, dokumen, ID Card, dan barcode',
    icon: UsersRound,
    sourceName: 'KBASE_MASTER_KARYAWAN.md',
    content: employeeMaster,
    status: 'Aktif',
  },
  {
    value: 'karyawan-kontrak',
    group: 'Karyawan',
    label: 'Pengelolaan Kontrak',
    description:
      'Pembuatan, masa berlaku, aktivasi, perpanjangan, dokumen, dan cetak kontrak',
    icon: BriefcaseBusiness,
    sourceName: 'KBASE_PENGELOLAAN_KONTRAK.md',
    content: employeeContracts,
    status: 'Aktif',
  },
  {
    value: 'karyawan-mutasi',
    group: 'Karyawan',
    label: 'Pengelolaan Mutasi',
    description: 'Perubahan site, jabatan, jenis, dan penempatan produksi',
    icon: GitBranchPlus,
    sourceName: 'KBASE_PENGELOLAAN_MUTASI.md',
    content: employeeMutations,
    status: 'Aktif',
  },
  {
    value: 'attendance-ringkasan',
    group: 'Attendance',
    label: 'Ringkasan Attendance',
    description: 'Peta panduan dan prinsip utama Attendance',
    icon: BookOpenText,
    sourceName: 'KBASE_ATTENDANCE.md',
    content: attendanceOverview,
    status: 'Aktif',
  },
  {
    value: 'attendance-pengaturan',
    group: 'Attendance',
    label: 'Pengaturan Attendance',
    description: 'Shift, kalender, perangkat, dan kesiapan operasional',
    icon: FileCog,
    sourceName: 'KBASE_PENGATURAN_ATTENDANCE.md',
    content: attendanceSettings,
    status: 'Aktif',
  },
  {
    value: 'attendance-operasional',
    group: 'Attendance',
    label: 'Operasional Harian',
    description: 'Scan, monitoring, koreksi, klasifikasi, dan finalisasi',
    icon: CalendarCheck2,
    sourceName: 'KBASE_OPERASIONAL_HARIAN_ATTENDANCE.md',
    content: attendanceOperations,
    status: 'Aktif',
  },
  {
    value: 'attendance-rekap',
    group: 'Attendance',
    label: 'Rekap Attendance',
    description: 'Kelengkapan, ekspor, dan kesiapan Payroll',
    icon: ClipboardList,
    sourceName: 'KBASE_REKAP_ATTENDANCE.md',
    content: attendanceRecap,
    status: 'Aktif',
  },
  {
    value: 'produksi-master',
    group: 'Produksi Borongan',
    label: 'Master Produksi',
    description: 'Pekerjaan, satuan, tarif per site, dan penugasan pekerja',
    icon: FileCog,
    sourceName: 'KBASE_MASTER_PRODUKSI.md',
    content: productionMaster,
    status: 'Aktif',
  },
  {
    value: 'produksi-transaksi',
    group: 'Produksi Borongan',
    label: 'Transaksi Setoran',
    description: 'Terminal setoran, transaksi, koreksi, dan setoran susulan',
    icon: Factory,
    sourceName: 'KBASE_TRANSAKSI_SETORAN_PRODUKSI.md',
    content: productionTransactions,
    status: 'Aktif',
  },
  {
    value: 'produksi-rekap',
    group: 'Produksi Borongan',
    label: 'Rekap Produksi',
    description: 'Membaca hasil produksi, nilai bruto, detail, dan ekspor',
    icon: ClipboardList,
    sourceName: 'KBASE_REKAP_PRODUKSI.md',
    content: productionRecap,
    status: 'Aktif',
  },
  {
    value: 'payroll',
    group: 'Payroll',
    label: 'Payroll',
    description: 'Ruang lingkup dan status dokumentasi Payroll',
    icon: Landmark,
    sourceName: 'KBASE_PAYROLL.md',
    content: payrollOverview,
    status: 'Kerangka',
  },
]

const groupOrder: ArticleDefinition['group'][] = [
  'Karyawan',
  'Attendance',
  'Produksi Borongan',
  'Payroll',
]

const articleByFileName = Object.fromEntries(
  articles.map((article) => [article.sourceName, article.value])
) as Record<string, KnowledgeArticle>

export function KnowledgeBasePage({
  article,
  onArticleChange,
}: {
  article?: KnowledgeArticle
  onArticleChange: (article?: KnowledgeArticle) => void
}) {
  const articleTopRef = useRef<HTMLDivElement>(null)
  const firstRenderRef = useRef(true)
  const activeArticle = articles.find((item) => item.value === article)
  const sections = useMemo(
    () => (activeArticle ? extractSections(activeArticle.content) : []),
    [activeArticle]
  )
  const readingTime = useMemo(
    () =>
      activeArticle
        ? Math.max(1, Math.ceil(countWords(activeArticle.content) / 220))
        : 0,
    [activeArticle]
  )

  useEffect(() => {
    if (firstRenderRef.current) {
      firstRenderRef.current = false
      return
    }
    articleTopRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }, [article])

  const markdownComponents = useMemo(
    () => createMarkdownComponents(onArticleChange),
    [onArticleChange]
  )

  return (
    <Main className='pb-12'>
      <div className='relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-background to-positive/10 px-5 py-6 sm:px-8 sm:py-8'>
        <div className='pointer-events-none absolute -top-16 -right-12 size-48 rounded-full bg-primary/10 blur-3xl' />
        <div className='relative max-w-3xl space-y-3'>
          <Badge
            variant='outline'
            className='gap-1.5 bg-background/70 backdrop-blur-sm'
          >
            <BookOpenText className='size-3.5 text-primary' /> Knowledge Base
            HRIS
          </Badge>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Panduan kerja HRIS RSIA
          </h1>
          <p className='max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base'>
            Temukan aturan dan langkah operasional lintas modul. Isi artikel
            berasal langsung dari dokumentasi Markdown yang dipelihara bersama
            aplikasi.
          </p>
        </div>
      </div>

      <Separator className='my-5 lg:my-7' />

      <div className='gap-7 md:flex md:items-start lg:gap-10'>
        <aside className='w-full md:sticky md:top-20 md:max-h-[calc(100svh-6rem)] md:w-72 md:shrink-0 md:overflow-y-auto md:pr-1'>
          <nav aria-label='Navigasi Knowledge Base HRIS'>
            <p className='mb-2 hidden px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:block'>
              Pusat panduan
            </p>
            <div className='flex gap-1 overflow-x-auto pb-2 md:block md:space-y-4 md:overflow-visible md:pb-0'>
              <button
                type='button'
                aria-current={!activeArticle ? 'page' : undefined}
                onClick={() => onArticleChange(undefined)}
                className={navItemClass(!activeArticle)}
              >
                <LayoutGrid
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    !activeArticle && 'text-primary'
                  )}
                />
                <span>
                  <span className='block text-sm font-medium'>
                    Beranda KBase
                  </span>
                  <span className='mt-0.5 hidden text-xs leading-4 text-muted-foreground md:block'>
                    Semua modul dan artikel tersedia
                  </span>
                </span>
              </button>

              {groupOrder.map((group) => (
                <div key={group} className='contents md:block'>
                  <p className='mt-4 mb-1 hidden px-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase md:block'>
                    {group}
                  </p>
                  <div className='contents md:block md:space-y-1'>
                    {articles
                      .filter((item) => item.group === group)
                      .map((item) => {
                        const isActive = item.value === activeArticle?.value
                        return (
                          <button
                            key={item.value}
                            type='button'
                            aria-current={isActive ? 'page' : undefined}
                            onClick={() => onArticleChange(item.value)}
                            className={navItemClass(isActive)}
                          >
                            <item.icon
                              className={cn(
                                'mt-0.5 size-4 shrink-0',
                                isActive && 'text-primary'
                              )}
                            />
                            <span>
                              <span className='block text-sm font-medium'>
                                {item.label}
                              </span>
                              <span className='mt-0.5 hidden text-xs leading-4 text-muted-foreground md:block'>
                                {item.description}
                              </span>
                            </span>
                          </button>
                        )
                      })}
                  </div>
                </div>
              ))}
            </div>

            {sections.length > 0 && (
              <div className='mt-6 hidden border-t pt-5 md:block'>
                <p className='mb-2 px-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase'>
                  Dalam artikel
                </p>
                <ol className='space-y-0.5'>
                  {sections.map((section) => (
                    <li key={section.id}>
                      <a
                        href={`#${section.id}`}
                        className='block rounded-md px-3 py-1.5 text-xs leading-4 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                      >
                        {section.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </nav>
        </aside>

        <div ref={articleTopRef} className='min-w-0 flex-1 scroll-mt-24'>
          {activeArticle ? (
            <>
              <div className='mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
                <Badge variant='secondary' className='font-normal'>
                  <FileText className='size-3' /> {activeArticle.sourceName}
                </Badge>
                <Badge
                  variant={
                    activeArticle.status === 'Aktif' ? 'default' : 'outline'
                  }
                >
                  {activeArticle.status}
                </Badge>
                <span aria-hidden='true'>•</span>
                <span>Sekitar {readingTime} menit baca</span>
              </div>
              <article className='rounded-xl border bg-card px-5 py-6 shadow-sm sm:px-8 sm:py-8 lg:px-10'>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {activeArticle.content}
                </ReactMarkdown>
              </article>
            </>
          ) : (
            <KnowledgeHome onArticleChange={onArticleChange} />
          )}
        </div>
      </div>
    </Main>
  )
}

function KnowledgeHome({
  onArticleChange,
}: {
  onArticleChange: (article: KnowledgeArticle) => void
}) {
  return (
    <section aria-labelledby='knowledge-home-title' className='space-y-6'>
      <div>
        <Badge variant='secondary' className='mb-3'>
          {articles.length} artikel tersedia
        </Badge>
        <h2
          id='knowledge-home-title'
          className='text-2xl font-bold tracking-tight'
        >
          Pilih modul yang ingin dipelajari
        </h2>
        <p className='mt-2 max-w-2xl text-sm leading-6 text-muted-foreground'>
          Mulai dari kebutuhan kerja Anda. Artikel berstatus Kerangka tetap
          ditampilkan agar ruang lingkup modul terlihat, tetapi belum boleh
          dianggap sebagai SOP operasional final.
        </p>
      </div>

      <div className='grid gap-4 lg:grid-cols-2'>
        {groupOrder.map((group) => {
          const groupArticles = articles.filter(
            (article) => article.group === group
          )
          const GroupIcon = groupIcon(group)
          return (
            <section
              key={group}
              className='rounded-xl border bg-card p-5 shadow-sm'
            >
              <div className='mb-4 flex items-start gap-3'>
                <div className='rounded-lg bg-primary/10 p-2 text-primary'>
                  <GroupIcon className='size-5' />
                </div>
                <div>
                  <h3 className='font-semibold'>{group}</h3>
                  <p className='text-xs text-muted-foreground'>
                    {groupArticles.length} artikel
                  </p>
                </div>
              </div>
              <div className='space-y-2'>
                {groupArticles.map((article) => (
                  <button
                    key={article.value}
                    type='button'
                    onClick={() => onArticleChange(article.value)}
                    className='flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                  >
                    <article.icon className='mt-0.5 size-4 shrink-0 text-primary' />
                    <span className='min-w-0 flex-1'>
                      <span className='flex flex-wrap items-center gap-2'>
                        <span className='text-sm font-medium'>
                          {article.label}
                        </span>
                        {article.status === 'Kerangka' && (
                          <Badge
                            variant='outline'
                            className='h-5 px-1.5 text-[10px]'
                          >
                            Kerangka
                          </Badge>
                        )}
                      </span>
                      <span className='mt-1 block text-xs leading-5 text-muted-foreground'>
                        {article.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}

function navItemClass(isActive: boolean) {
  return cn(
    'group flex min-w-max items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring md:w-full md:min-w-0',
    isActive
      ? 'bg-muted text-foreground'
      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
  )
}

function groupIcon(group: ArticleDefinition['group']) {
  if (group === 'Karyawan') return UsersRound
  if (group === 'Attendance') return CalendarCheck2
  if (group === 'Produksi Borongan') return Factory
  return Landmark
}

function createMarkdownComponents(
  onArticleChange: (article: KnowledgeArticle) => void
): Components {
  const linkClass =
    'font-medium text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary'
  return {
    h1: ({ children }) => (
      <h1
        id={slugify(nodeText(children))}
        className='mb-5 scroll-mt-24 text-2xl font-bold tracking-tight text-foreground sm:text-3xl'
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        id={slugify(nodeText(children))}
        className='mt-10 mb-4 scroll-mt-24 border-b pb-2 text-xl font-semibold tracking-tight text-foreground first:mt-0'
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        id={slugify(nodeText(children))}
        className='mt-7 mb-3 scroll-mt-24 text-base font-semibold text-foreground sm:text-lg'
      >
        {children}
      </h3>
    ),
    p: ({ children }) => (
      <p className='my-3 text-sm leading-7 text-foreground/85 sm:text-[15px]'>
        {children}
      </p>
    ),
    ul: ({ children, className }) => (
      <ul
        className={cn(
          'my-4 list-disc space-y-2 ps-6 text-sm leading-6 text-foreground/85 marker:text-primary sm:text-[15px]',
          className
        )}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className='my-4 list-decimal space-y-2 ps-6 text-sm leading-6 text-foreground/85 marker:font-semibold marker:text-primary sm:text-[15px]'>
        {children}
      </ol>
    ),
    li: ({ children, className }) => (
      <li className={cn('ps-1', className)}>{children}</li>
    ),
    strong: ({ children }) => (
      <strong className='font-semibold text-foreground'>{children}</strong>
    ),
    blockquote: ({ children }) => (
      <blockquote className='my-5 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm [&>p]:my-1 [&>p]:leading-6'>
        {children}
      </blockquote>
    ),
    hr: () => <Separator className='my-8' />,
    code: ({ className, children }) =>
      className ? (
        <code className={cn('font-mono text-xs', className)}>{children}</code>
      ) : (
        <code className='rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground'>
          {children}
        </code>
      ),
    pre: ({ children }) => (
      <pre className='my-5 overflow-x-auto rounded-lg border bg-muted/60 p-4 text-sm leading-6'>
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className='my-5 overflow-x-auto rounded-lg border'>
        <table className='w-full min-w-[36rem] border-collapse text-left text-sm'>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className='bg-muted/70'>{children}</thead>,
    th: ({ children }) => (
      <th className='border-b px-3 py-2.5 align-top font-semibold text-foreground'>
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className='border-b px-3 py-2.5 align-top leading-6 text-foreground/80 last:[tr:last-child_&]:border-b-0'>
        {children}
      </td>
    ),
    a: ({ href = '', children }) => {
      const targetArticle = knowledgeArticleFromHref(href)
      if (targetArticle) {
        return (
          <a
            href={`/panduan?artikel=${targetArticle}`}
            onClick={(event) => {
              event.preventDefault()
              onArticleChange(targetArticle)
            }}
            className={linkClass}
          >
            {children}
          </a>
        )
      }
      if (href.startsWith('#'))
        return (
          <a href={href} className={linkClass}>
            {children}
          </a>
        )
      if (/^https?:\/\//i.test(href))
        return (
          <a href={href} target='_blank' rel='noreferrer' className={linkClass}>
            {children}
          </a>
        )
      if (href.toLowerCase().includes('.md')) {
        return (
          <span
            title='Dokumen ini belum terdaftar pada Knowledge Base aplikasi.'
            className='font-medium text-muted-foreground underline decoration-dotted underline-offset-4'
          >
            {children}
          </span>
        )
      }
      return (
        <a href={href} className={linkClass}>
          {children}
        </a>
      )
    },
    input: ({ type, ...props }) =>
      type === 'checkbox' ? (
        <input
          type='checkbox'
          className='me-2 size-4 translate-y-0.5 accent-primary'
          {...props}
        />
      ) : (
        <input type={type} {...props} />
      ),
  }
}

function knowledgeArticleFromHref(href: string) {
  const fileName = href.split('#')[0].split('/').pop()
  return fileName ? articleByFileName[fileName] : undefined
}

function extractSections(markdown: string) {
  return Array.from(markdown.matchAll(/^##\s+(.+)$/gm)).map((match) => {
    const title = cleanHeading(match[1])
    return { title, id: slugify(title) }
  })
}

function cleanHeading(value: string) {
  return value
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join('')
  if (node && typeof node === 'object' && 'props' in node) {
    return nodeText((node.props as { children?: ReactNode }).children)
  }
  return ''
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

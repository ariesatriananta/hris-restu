import { useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Printer, X } from 'lucide-react'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'

export type ContractPrintSnapshot = {
  version: 'PKWT_PRODUCTION_SECTION_V2'
  generatedAt: string
  contract: {
    uid: string
    number: string
    type: string
    startDate: string
    endDate?: string | null
    signedDate?: string | null
  }
  company: {
    name: string
    headOfficeAddress: string
    director: {
      name: string
      title: string
    }
  }
  employee: {
    name: string
    employeeNumber: string
    nationalIdNumber: string
    birthPlace?: string | null
    birthDate?: string | null
    address: string
    joinDate?: string | null
    position: string
  }
  employment: {
    site: string
    productionModule?: string | null
    productionSection: {
      code: string
      name: string
    }
  }
  target: {
    value: number
    unit: string
  }
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' })
const dayFormatter = new Intl.DateTimeFormat('id-ID', { weekday: 'long' })
const monthFormatter = new Intl.DateTimeFormat('id-ID', { month: 'long' })

function parseDate(value?: string | null) {
  if (!value) return null
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function date(value?: string | null, emptyValue = '________________') {
  const parsed = parseDate(value)
  return parsed ? dateFormatter.format(parsed) : emptyValue
}

function openingDate(value?: string | null) {
  const parsed = parseDate(value)
  if (!parsed) {
    return {
      day: '__________',
      date: '__________',
      month: '__________',
      year: '__________',
    }
  }

  return {
    day: dayFormatter.format(parsed),
    date: String(parsed.getDate()),
    month: monthFormatter.format(parsed),
    year: String(parsed.getFullYear()),
  }
}

function useAutoPrint(isReady: boolean) {
  useEffect(() => {
    if (!isReady) return
    let cancelled = false

    void (async () => {
      await document.fonts?.ready
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
      if (!cancelled) window.print()
    })()

    return () => {
      cancelled = true
    }
  }, [isReady])
}

export function ContractPrintPage({ contractUid }: { contractUid: string }) {
  const preview = useQuery({
    queryKey: ['contract-print', contractUid],
    queryFn: async () =>
      (
        await apiClient.get<ContractPrintSnapshot>(
          `/employees/contracts/${contractUid}/print-preview`
        )
      ).data,
  })

  useAutoPrint(Boolean(preview.data))

  if (preview.isPending) {
    return (
      <p className='p-8 text-center text-muted-foreground'>
        Menyiapkan dokumen kontrak...
      </p>
    )
  }

  if (preview.isError || !preview.data) {
    return (
      <p className='p-8 text-center'>
        Preview kontrak belum tersedia atau tidak dapat dibuka.
      </p>
    )
  }

  return (
    <main className='contract-print-root min-h-screen bg-muted p-4 print:bg-white print:p-0'>
      <div className='mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 print:hidden'>
        <Button variant='outline' onClick={() => window.close()}>
          <X /> Tutup
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Cetak
        </Button>
      </div>

      <ContractPrintDocument data={preview.data} />
    </main>
  )
}

export function ContractBulkPrintPage({
  contractUids,
}: {
  contractUids: string[]
}) {
  const previews = useQuery({
    queryKey: ['contract-print-bulk', contractUids],
    queryFn: async () =>
      (
        await apiClient.get<{ items: ContractPrintSnapshot[] }>(
          '/employees/contracts/print-previews',
          { params: { contractUids: contractUids.join(',') } }
        )
      ).data.items,
    enabled: contractUids.length > 0,
  })

  useAutoPrint(Boolean(previews.data?.length))

  if (!contractUids.length) {
    return <p className='p-8 text-center'>Tidak ada kontrak yang dipilih.</p>
  }

  if (previews.isPending) {
    return (
      <p className='p-8 text-center text-muted-foreground'>
        Menyiapkan dokumen kontrak...
      </p>
    )
  }

  if (previews.isError || !previews.data?.length) {
    return (
      <p className='p-8 text-center'>
        Preview kontrak belum tersedia atau tidak dapat dibuka.
      </p>
    )
  }

  return (
    <main className='contract-print-root min-h-screen bg-muted p-4 print:bg-white print:p-0'>
      <div className='mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 print:hidden'>
        <Button variant='outline' onClick={() => window.close()}>
          <X /> Tutup
        </Button>
        <Button onClick={() => window.print()}>
          <Printer /> Cetak {previews.data.length} Kontrak
        </Button>
      </div>

      <div className='space-y-4 print:space-y-0'>
        {previews.data.map((item) => (
          <ContractPrintDocument key={item.contract.uid} data={item} />
        ))}
      </div>
    </main>
  )
}

const pageClassName =
  'contract-print-page mx-auto box-border h-[297mm] w-[210mm] overflow-hidden bg-white px-[17mm] py-[16mm] text-[9.35pt] leading-[1.22] text-black shadow print:shadow-none'
const columnClassName = 'min-w-0 space-y-2 text-justify'
const numberedListClassName =
  'list-decimal space-y-1 pl-[1.15rem] marker:font-normal'
const letteredListClassName =
  'list-[lower-alpha] space-y-0.5 pl-[1.15rem] marker:font-normal'

function ContractPage({
  children,
  last = false,
}: {
  children: ReactNode
  last?: boolean
}) {
  return (
    <section
      className={`${pageClassName} ${last ? '' : 'print:break-after-page'}`}
    >
      {children}
    </section>
  )
}

function TwoColumns({ children }: { children: ReactNode }) {
  return <div className='grid h-full grid-cols-2 gap-[12mm]'>{children}</div>
}

function ArticleHeading({
  number,
  children,
}: {
  number: number
  children: ReactNode
}) {
  return (
    <header className='mt-4 mb-1 text-center leading-[1.15] font-bold uppercase first:mt-0'>
      <p>Pasal {number}</p>
      <h2>{children}</h2>
    </header>
  )
}

function BlankLines({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-label='Bagian yang akan diisi kemudian'
      className='mt-3 space-y-3'
    >
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className='h-4 border-b border-black' />
      ))}
    </div>
  )
}

export function ContractPrintDocument({
  data,
}: {
  data: ContractPrintSnapshot
}) {
  const signed = openingDate(data.contract.signedDate)
  const target = `${new Intl.NumberFormat('id-ID').format(data.target.value)} ${data.target.unit}`

  return (
    <article className='contract-print-document space-y-4 print:space-y-0'>
      <ContractPage>
        <TwoColumns>
          <div className={columnClassName}>
            <header className='mb-7 text-center text-[11.5pt] leading-[1.18] font-bold uppercase'>
              <h1>
                Perjanjian Kerja Waktu Tertentu (PKWT)
                <br />
                dengan Sistem Pengupahan Satuan Hasil
              </h1>
              <p className='mt-6 normal-case'>Nomor: {data.contract.number}</p>
            </header>

            <p>
              Pada hari ini <span className='font-medium'>{signed.day}</span>{' '}
              tanggal <span className='font-medium'>{signed.date}</span> bulan{' '}
              <span className='font-medium'>{signed.month}</span> tahun{' '}
              <span className='font-medium'>{signed.year}</span>, telah dibuat
              dan disepakati Perjanjian Kerja Waktu Tertentu (PKWT) antara:
            </p>

            <p className='mt-6'>
              <b>{data.company.name}</b>, sebuah perseroan terbatas yang
              didirikan, beroperasi, dan tunduk berdasarkan hukum negara
              Republik Indonesia, berkedudukan hukum di{' '}
              {data.company.headOfficeAddress}, yang dalam perbuatan hukum ini
              sah diwakili oleh <b>{data.company.director.name}</b> dalam
              jabatannya selaku {data.company.director.title}, selanjutnya
              disebut sebagai <b>&quot;PERUSAHAAN&quot;</b>.
            </p>

            <dl className='mt-6 grid grid-cols-[19mm_1fr] gap-x-2 gap-y-1.5 text-left'>
              <dt>Nama</dt>
              <dd>: {data.employee.name}</dd>
              <dt>NIK</dt>
              <dd>: {data.employee.nationalIdNumber}</dd>
              <dt>Tempat/Tanggal Lahir</dt>
              <dd>
                : {data.employee.birthPlace || '________________'},{' '}
                {date(data.employee.birthDate)}
              </dd>
              <dt>Alamat</dt>
              <dd>: {data.employee.address}</dd>
            </dl>

            <p className='mt-4'>
              Selanjutnya disebut <b>&quot;PEKERJA&quot;</b>.
            </p>

            <div className='mt-6 space-y-2'>
              <p>
                Bahwa PERUSAHAAN sedang melakukan penataan administrasi
                ketenagakerjaan guna menciptakan sistem hubungan kerja yang
                lebih jelas, tertib, terukur, dan berkelanjutan;
              </p>
              <p>
                Bahwa PERUSAHAAN melaksanakan kegiatan produksi produk rokok
                yang volume produksi, tingkat permintaan pasar, dan
                keberlangsungan usahanya memerlukan evaluasi secara berkala
                sesuai perkembangan usaha;
              </p>
            </div>
          </div>

          <div className={columnClassName}>
            <div className='space-y-2'>
              <p>
                Bahwa Para Pihak bermaksud memperjelas status hubungan kerja,
                sistem pengupahan, serta administrasi ketenagakerjaan tanpa
                mengurangi masa kerja yang telah dijalani oleh PEKERJA;
              </p>
              <p>
                Para Pihak sepakat mengikatkan diri dalam hubungan kerja dengan
                ketentuan sebagai berikut:
              </p>
            </div>

            <ArticleHeading number={1}>
              Pengakuan Masa Kerja dan Status Hubungan Kerja
            </ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                PEKERJA telah melaksanakan pekerjaan pada PERUSAHAAN sejak
                tanggal {date(data.employee.joinDate)}.
              </li>
              <li>
                Masa kerja PEKERJA tetap diakui dan diperhitungkan sejak tanggal
                pertama bekerja.
              </li>
              <li>
                Penataan administrasi hubungan kerja tidak dimaksudkan untuk
                menghapus atau mengurangi masa kerja yang telah dijalani.
              </li>
              <li>
                Hubungan kerja dilaksanakan untuk mendukung kegiatan produksi
                dan pengembangan produk rokok yang masih memerlukan evaluasi
                pasar dan kelayakan usaha.
              </li>
              <li>
                Para Pihak sepakat bahwa hubungan kerja dilaksanakan berdasarkan
                PKWT sesuai ketentuan yang berlaku.
              </li>
            </ol>

            <ArticleHeading number={2}>Jangka Waktu Perjanjian</ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                Perjanjian ini berlaku sejak tanggal ditandatangani sampai
                dengan {date(data.contract.endDate)}.
              </li>
              <li>
                Berakhirnya Perjanjian ini tidak menghapus pengakuan masa kerja
                sebagaimana Pasal 1.
              </li>
              <li>
                Perpanjangan atau pembaharuan hubungan kerja dilakukan sesuai
                ketentuan yang berlaku.
              </li>
            </ol>

            <ArticleHeading number={3}>Jenis Pekerjaan</ArticleHeading>
            <p>
              PEKERJA ditugaskan pada pekerjaan{' '}
              <b>{data.employment.productionSection.name}</b> dengan target
              kerja <b>{target}</b>.
            </p>
          </div>
        </TwoColumns>
      </ContractPage>

      <ContractPage>
        <TwoColumns>
          <div className={columnClassName}>
            <ArticleHeading number={4}>Waktu Kerja</ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                PEKERJA dapat melaksanakan pekerjaan sesuai jadwal kerja
                operasional PERUSAHAAN yang ditetapkan oleh PERUSAHAAN.
              </li>
              <li>
                Waktu kerja dilaksanakan sesuai ketentuan peraturan
                perundang-undangan yang berlaku.
              </li>
              <li>
                Dalam rangka menyesuaikan kebutuhan produksi, pesanan pelanggan,
                ketersediaan bahan baku, kapasitas produksi, dan kondisi
                operasional lainnya, PERUSAHAAN dapat melakukan penyesuaian
                terkait:
                <ol className={`${letteredListClassName} mt-1`}>
                  <li>hari kerja operasional;</li>
                  <li>jam kerja operasional; dan/atau</li>
                  <li>pembagian atau penyesuaian kelompok kerja.</li>
                </ol>
              </li>
              <li>
                Penyesuaian sebagaimana dimaksud pada ayat (3) dilakukan dengan
                tetap memperhatikan ketentuan peraturan perundang-undangan yang
                berlaku.
              </li>
              <li>
                Kehadiran PEKERJA dicatat melalui sistem presensi atau mekanisme
                pencatatan kehadiran yang ditetapkan oleh PERUSAHAAN.
              </li>
              <li>
                Dalam hal tersedia pekerjaan dan PEKERJA tidak hadir tanpa
                alasan yang sah, hasil kerja yang tidak diperoleh akibat
                ketidakhadiran tersebut menjadi tanggung jawab PEKERJA dan tidak
                menimbulkan kewajiban pembayaran penghasilan oleh PERUSAHAAN.
              </li>
            </ol>

            <ArticleHeading number={5}>
              Sistem Pengupahan Satuan Hasil
            </ArticleHeading>
            <BlankLines count={5} />
          </div>

          <div className={columnClassName}>
            <ArticleHeading number={6}>Evaluasi Kerja</ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                PEKERJA akan mengikuti Evaluasi Kerja (EK) secara berkala.
              </li>
              <li>
                Komponen penilaian dari Evaluasi Kerja adalah sebagai berikut:
                <ol className={`${letteredListClassName} mt-1`}>
                  <li>
                    Pencapaian terhadap target kerja yang sudah ditentukan oleh
                    PERUSAHAAN;
                  </li>
                  <li>Kehadiran;</li>
                  <li>Disiplin;</li>
                  <li>Kualitas hasil kerja;</li>
                  <li>Sikap kerja.</li>
                </ol>
              </li>
            </ol>

            <ArticleHeading number={7}>
              Tunjangan Hari Raya (THR)
            </ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                PEKERJA berhak memperoleh Tunjangan Hari Raya Keagamaan sesuai
                ketentuan peraturan perundang-undangan dan peraturan perusahaan
                yang berlaku.
              </li>
              <li>
                Penetapan upah sebulan berdasarkan satuan hasil ditetapkan
                berdasarkan upah rata-rata 12 (dua belas) bulan terakhir yang
                diterima oleh PEKERJA.
              </li>
            </ol>

            <ArticleHeading number={8}>BPJS</ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                PEKERJA akan didaftarkan pada program BPJS Kesehatan dan BPJS
                Ketenagakerjaan sesuai ketentuan yang berlaku.
              </li>
              <li>
                Potongan iuran yang menjadi kewajiban pekerja akan dilakukan
                sesuai peraturan yang berlaku.
              </li>
            </ol>
          </div>
        </TwoColumns>
      </ContractPage>

      <ContractPage>
        <TwoColumns>
          <div className={columnClassName}>
            <ArticleHeading number={9}>
              Hak &amp; Kewajiban Pekerja
            </ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                Hak PEKERJA:
                <ol className={`${letteredListClassName} mt-1`}>
                  <li>Mendapatkan upah sesuai dengan hasil kerja;</li>
                  <li>
                    Mendapatkan waktu istirahat sebagaimana diatur dalam
                    peraturan perundang-undangan;
                  </li>
                  <li>
                    Mendapatkan cuti sebagaimana diatur dalam peraturan
                    perundang-undangan;
                  </li>
                  <li>
                    Mendapatkan Tunjangan Hari Raya Keagamaan sebagaimana diatur
                    dalam peraturan perundang-undangan;
                  </li>
                  <li>Mendapatkan perlindungan sosial dan kesehatan;</li>
                  <li>
                    Mendapatkan hak kompensasi akibat berakhirnya hubungan
                    kerja;
                  </li>
                  <li>
                    Mendapatkan hak-hak lainnya yang diatur dalam peraturan
                    perundang-undangan.
                  </li>
                </ol>
              </li>
              <li>
                Kewajiban PEKERJA:
                <ol className={`${letteredListClassName} mt-1`}>
                  <li>
                    Menghasilkan pekerjaan sesuai dengan standar kualitas yang
                    ditetapkan oleh PERUSAHAAN;
                  </li>
                  <li>Mematuhi Peraturan Perusahaan;</li>
                  <li>Mematuhi instruksi yang diberikan oleh PERUSAHAAN;</li>
                  <li>Menjaga aset dan fasilitas PERUSAHAAN;</li>
                  <li>Mematuhi ketentuan K3.</li>
                </ol>
              </li>
            </ol>

            <ArticleHeading number={10}>Larangan</ArticleHeading>
            <p>PEKERJA dilarang:</p>
            <ol className={numberedListClassName}>
              <li>Melakukan tindakan yang merugikan perusahaan;</li>
              <li>Menyalahgunakan fasilitas perusahaan;</li>
              <li>Membocorkan informasi rahasia perusahaan;</li>
              <li>Melakukan pelanggaran hukum atau peraturan perusahaan.</li>
            </ol>
          </div>

          <div className={columnClassName}>
            <ArticleHeading number={11}>
              Pembinaan dan Tindakan Disiplin
            </ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                PERUSAHAAN dapat melakukan pembinaan terhadap PEKERJA yang belum
                memenuhi standar kerja atau disiplin kerja.
              </li>
              <li>
                Apabila terjadi pelanggaran terhadap Peraturan Perusahaan
                dan/atau peraturan perundang-undangan yang berlaku, PERUSAHAAN
                dapat melakukan tindakan sebagaimana diatur dalam Peraturan
                Perusahaan dan/atau ketentuan peraturan perundang-undangan yang
                berlaku.
              </li>
            </ol>

            <ArticleHeading number={12}>Kerahasiaan</ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                PEKERJA menjamin kerahasiaan informasi yang diberikan dan
                disampaikan oleh PERUSAHAAN baik secara lisan, tertulis, melalui
                media elektronik, atau dalam bentuk lainnya selama periode
                Jangka Waktu Perjanjian. Informasi tersebut hanya dipergunakan
                untuk melaksanakan pekerjaan dan demi kepentingan PERUSAHAAN.
              </li>
              <li>
                PEKERJA wajib menjaga Informasi Rahasia yang termasuk namun
                tidak terbatas pada:
                <ol className={`${letteredListClassName} mt-1`}>
                  <li>
                    Seluruh informasi, baik tertulis maupun lisan, yang
                    disampaikan melalui media elektronik atau dalam bentuk
                    lainnya dan telah dinyatakan sebagai rahasia oleh
                    PERUSAHAAN;
                  </li>
                  <li>
                    Informasi yang apabila diungkapkan kepada pihak lain di luar
                    Perjanjian ini dapat menyebabkan kerugian bagi PERUSAHAAN;
                  </li>
                  <li>
                    Informasi bernilai rahasia yang diungkapkan oleh pihak lain
                    yang telah ditunjuk oleh PERUSAHAAN.
                  </li>
                </ol>
              </li>
            </ol>
          </div>
        </TwoColumns>
      </ContractPage>

      <ContractPage>
        <TwoColumns>
          <div className={columnClassName}>
            <ol
              className={`${numberedListClassName} [counter-reset:list-item_2]`}
              start={3}
            >
              <li>
                Seluruh Informasi Rahasia tersebut tetap menjadi milik
                PERUSAHAAN, sebelum, selama, dan setelah berakhirnya Perjanjian
                ini, serta harus tetap menjadi Informasi Rahasia bagi Para
                Pihak.
              </li>
              <li>
                PEKERJA menjamin kepada PERUSAHAAN bahwa akan menjaga Informasi
                Rahasia tersebut dari kebocoran informasi, pembajakan, dan
                perbuatan melawan hukum lainnya yang menyebabkan Informasi
                Rahasia tersebut menjadi bukan Informasi Rahasia lagi.
              </li>
              <li>
                PEKERJA menyadari dan memahami bahwa terungkapnya Informasi
                Rahasia akan mengakibatkan kerugian bagi PERUSAHAAN.
              </li>
              <li>
                PERUSAHAAN berhak menempuh upaya hukum, baik secara perdata
                maupun pidana, terhadap PEKERJA yang terbukti melakukan atau
                terlibat dalam tindakan yang mengakibatkan terbukanya atau
                tersebarnya rahasia PERUSAHAAN.
              </li>
            </ol>

            <ArticleHeading number={13}>
              Berakhirnya Hubungan Kerja
            </ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                Hubungan kerja berakhir karena:
                <ol className={`${letteredListClassName} mt-1`}>
                  <li>PEKERJA meninggal dunia;</li>
                  <li>Berakhirnya jangka waktu PKWT;</li>
                  <li>
                    PERUSAHAAN dan PEKERJA sepakat untuk mengakhiri Perjanjian
                    ini sebelum berakhirnya Jangka Waktu Perjanjian berdasarkan
                    kesepakatan bersama yang dibuat secara tertulis;
                  </li>
                  <li>Putusan pengadilan;</li>
                  <li>
                    Sebab lain yang diatur dalam peraturan perundang-undangan
                    dan/atau Peraturan Perusahaan yang berlaku.
                  </li>
                </ol>
              </li>
              <li>
                PERUSAHAAN berhak untuk mengakhiri Jangka Waktu Perjanjian ini
                secara sepihak dalam hal PEKERJA melanggar larangan dan/atau
                melakukan pelanggaran berat sebagaimana ditentukan dalam Tata
                Tertib atau Peraturan Perusahaan.
              </li>
            </ol>
          </div>

          <div className={columnClassName}>
            <ArticleHeading number={14}>
              Penyelesaian Perselisihan
            </ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                Segala perselisihan yang timbul sebagai akibat dari pelaksanaan
                hubungan kerja di antara PERUSAHAAN dan PEKERJA wajib
                diselesaikan secara musyawarah untuk mufakat.
              </li>
              <li>
                Dalam hal penyelesaian secara musyawarah untuk mufakat
                sebagaimana dimaksud pada ayat (1) tidak mencapai kesepakatan,
                PERUSAHAAN dan PEKERJA sepakat menyelesaikan perselisihan
                melalui prosedur peraturan perundang-undangan yang berlaku.
              </li>
            </ol>

            <ArticleHeading number={15}>Addendum</ArticleHeading>
            <p>
              Segala perubahan dan hal-hal lain yang belum diatur dan/atau belum
              cukup diatur dalam Perjanjian ini akan dituangkan dalam suatu
              addendum yang disepakati dan ditandatangani oleh Para Pihak, yang
              merupakan satu kesatuan dan bagian yang tidak terpisahkan dari
              Perjanjian ini.
            </p>

            <ArticleHeading number={16}>Ketentuan Penutup</ArticleHeading>
            <ol className={numberedListClassName}>
              <li>
                Hal-hal yang belum diatur dalam Perjanjian ini akan mengikuti
                Peraturan Perusahaan dan peraturan perundang-undangan yang
                berlaku.
              </li>
              <li>
                Pajak Penghasilan dari PEKERJA menjadi tanggung jawab PEKERJA.
              </li>
              <li>
                Perjanjian ini dibuat dalam keadaan sadar, tanpa paksaan dari
                pihak mana pun.
              </li>
            </ol>

            <p className='mt-5'>
              Demikian Perjanjian Kerja Waktu Tertentu ini dibuat dan
              ditandatangani oleh Para Pihak untuk dipatuhi sebagaimana
              mestinya.
            </p>
          </div>
        </TwoColumns>
      </ContractPage>

      <ContractPage last>
        <div className='mx-auto mt-[8mm] w-[120mm] text-center text-[10.5pt] leading-tight'>
          <h2 className='font-bold'>Para Pihak,</h2>
          <div className='mt-4 grid grid-cols-2 gap-[28mm] font-bold'>
            <p>Perusahaan</p>
            <p>Pekerja</p>
          </div>
          <div className='mt-[38mm] grid grid-cols-2 gap-[28mm]'>
            <div>
              <p className='font-bold'>{data.company.director.name}</p>
              <p className='mt-1 font-bold'>{data.company.director.title}</p>
            </div>
            <div>
              <p className='font-bold'>{data.employee.name}</p>
              <p className='mt-1 font-bold'>{data.employee.position}</p>
            </div>
          </div>
        </div>
      </ContractPage>
    </article>
  )
}

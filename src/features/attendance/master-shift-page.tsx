import { useCallback, useState } from 'react'
import { isAxiosError } from 'axios'
import { CalendarClock, Plus, UserRoundCog } from 'lucide-react'
import { toast } from 'sonner'
import type { NavigateFn } from '@/hooks/use-table-url-state'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Main } from '@/components/layout/main'
import {
  useDeleteShift,
  useDeleteShiftAssignment,
  useAttendanceFoundation,
  useShiftAssignments,
  useShifts,
} from './data/queries'
import type {
  Shift,
  ShiftAssignment,
  ShiftAssignmentListParams,
  ShiftListParams,
} from './domain'
import { ShiftAssignmentDialog, ShiftDialog } from './shift-dialogs'
import { ShiftAssignmentTable, ShiftTable } from './shift-tables'

export function MasterShiftPage({
  search,
  navigate,
}: {
  search: Record<string, unknown>
  navigate: NavigateFn
}) {
  const tab = search.tab === 'assignment' ? 'assignment' : 'shift'
  const [shiftDialogOpen, setShiftDialogOpen] = useState(false)
  const [assignmentDialogOpen, setAssignmentDialogOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<Shift>()
  const [deleteShiftTarget, setDeleteShiftTarget] = useState<Shift>()
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] =
    useState<ShiftAssignment>()
  const shiftParams: ShiftListParams = {
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    isActive: arrayValue(search.isActive),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  }
  const assignmentParams: ShiftAssignmentListParams = {
    query: stringValue(search.filter),
    site: arrayValue(search.site),
    employeeType: arrayValue(search.employeeType),
    productionModule: arrayValue(search.productionModule),
    productionSection: arrayValue(search.productionSection),
    shiftUid: arrayValue(search.shiftUid),
    status: arrayValue(search.status),
    page: numberValue(search.page, 1),
    pageSize: numberValue(search.pageSize, 50),
  }
  const shifts = useShifts(shiftParams)
  const foundation = useAttendanceFoundation()
  const assignmentShifts = useShifts({ page: 1, pageSize: 500 })
  const assignments = useShiftAssignments(assignmentParams)
  const deleteShift = useDeleteShift()
  const deleteAssignment = useDeleteShiftAssignment()
  const editShift = useCallback((shift: Shift) => {
    setEditingShift(shift)
    setShiftDialogOpen(true)
  }, [])
  const requestDeleteShift = useCallback(
    (shift: Shift) => setDeleteShiftTarget(shift),
    []
  )
  const requestDeleteAssignment = useCallback(
    (assignment: ShiftAssignment) => setDeleteAssignmentTarget(assignment),
    []
  )
  const allShifts = assignmentShifts.data?.items ?? []
  const siteOptions =
    foundation.data?.sites.map((site) => ({
      value: site.code,
      label: site.name,
    })) ?? []
  const selectedSites = assignmentParams.site ?? []
  const selectedModules = assignmentParams.productionModule ?? []
  const productionModules = foundation.data?.lookups.productionModules ?? []
  const productionSections = foundation.data?.lookups.productionSections ?? []
  const productionModuleOptions = dedupeOptions(
    productionModules
      .filter(
        (module) =>
          !selectedSites.length ||
          selectedSites.includes(module.site as Shift['site'])
      )
      .map((module) => ({
        value: module.uid,
        label: `${module.code} · ${module.name}`,
      }))
  )
  const productionSectionOptions = dedupeOptions(
    productionSections
      .filter(
        (section) =>
          (!selectedSites.length ||
            selectedSites.includes(section.site as Shift['site'])) &&
          (!selectedModules.length ||
            selectedModules.includes(section.moduleUid))
      )
      .map((section) => ({
        value: section.uid,
        label: `${section.code} · ${section.name}`,
      }))
  )
  return (
    <Main>
      <div className='mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end'>
        <div>
          <p className='text-sm font-medium text-primary'>Attendance</p>
          <h1 className='text-2xl font-bold tracking-tight sm:text-3xl'>
            Master Shift
          </h1>
          <p className='text-muted-foreground'>
            Atur atau ganti shift tanpa menghapus histori penugasan sebelumnya.
          </p>
        </div>
        {tab === 'shift' ? (
          <Button
            onClick={() => {
              setEditingShift(undefined)
              setShiftDialogOpen(true)
            }}
          >
            <Plus /> Tambah Shift
          </Button>
        ) : (
          <Button onClick={() => setAssignmentDialogOpen(true)}>
            <UserRoundCog /> Atur / Ganti Shift
          </Button>
        )}
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) =>
          navigate({
            search: (previous) => ({
              ...previous,
              tab: value === 'shift' ? undefined : value,
              page: undefined,
              filter: undefined,
              isActive: undefined,
              employeeType: undefined,
              productionModule: undefined,
              productionSection: undefined,
              shiftUid: undefined,
              status: undefined,
            }),
          })
        }
        className='space-y-4'
      >
        <TabsList className='h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1 sm:w-fit'>
          <TabsTrigger value='shift' className='h-10 flex-none gap-2 px-4'>
            <CalendarClock /> Master Shift
          </TabsTrigger>
          <TabsTrigger value='assignment' className='h-10 flex-none gap-2 px-4'>
            <UserRoundCog /> Penugasan & Histori
          </TabsTrigger>
        </TabsList>
        <TabsContent value='shift'>
          <ShiftTable
            result={shifts}
            search={search}
            navigate={navigate}
            onEdit={editShift}
            onDelete={requestDeleteShift}
            siteOptions={siteOptions}
          />
        </TabsContent>
        <TabsContent value='assignment'>
          <ShiftAssignmentTable
            result={assignments}
            shifts={allShifts}
            search={search}
            navigate={navigate}
            onDelete={requestDeleteAssignment}
            siteOptions={siteOptions}
            productionModuleOptions={productionModuleOptions}
            productionSectionOptions={productionSectionOptions}
          />
        </TabsContent>
      </Tabs>
      {shiftDialogOpen && (
        <ShiftDialog
          value={editingShift}
          open
          onOpenChange={setShiftDialogOpen}
          siteOptions={siteOptions as { value: Shift['site']; label: string }[]}
        />
      )}
      {assignmentDialogOpen && (
        <ShiftAssignmentDialog
          open
          onOpenChange={setAssignmentDialogOpen}
          shifts={allShifts}
          siteOptions={siteOptions as { value: Shift['site']; label: string }[]}
          productionModules={productionModules}
          productionSections={productionSections}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteShiftTarget)}
        onOpenChange={(open) => !open && setDeleteShiftTarget(undefined)}
        title='Hapus shift?'
        desc={`Shift ${deleteShiftTarget?.name ?? ''} akan dihapus permanen. Penugasan yang belum dipakai dapat ikut dibersihkan oleh server.`}
        confirmText='Hapus shift'
        destructive
        isLoading={deleteShift.isPending}
        handleConfirm={() => {
          if (!deleteShiftTarget) return
          deleteShift.mutate(deleteShiftTarget.uid, {
            onSuccess: () => {
              toast.success('Shift berhasil dihapus.')
              setDeleteShiftTarget(undefined)
            },
            onError: (error) => {
              toast.error(apiMessage(error, 'Shift gagal dihapus.'))
              setDeleteShiftTarget(undefined)
            },
          })
        }}
      />
      <ConfirmDialog
        open={Boolean(deleteAssignmentTarget)}
        onOpenChange={(open) => !open && setDeleteAssignmentTarget(undefined)}
        title='Hapus penugasan mendatang?'
        desc={`Penugasan ${deleteAssignmentTarget?.employeeName ?? ''} pada shift ${deleteAssignmentTarget?.shiftName ?? ''} akan dihapus. Penugasan berjalan atau yang sudah dipakai tidak dapat dihapus.`}
        confirmText='Hapus penugasan'
        destructive
        isLoading={deleteAssignment.isPending}
        handleConfirm={() => {
          if (!deleteAssignmentTarget) return
          deleteAssignment.mutate(deleteAssignmentTarget.uid, {
            onSuccess: () => {
              toast.success('Penugasan shift berhasil dihapus.')
              setDeleteAssignmentTarget(undefined)
            },
            onError: (error) => {
              toast.error(apiMessage(error, 'Penugasan shift gagal dihapus.'))
              setDeleteAssignmentTarget(undefined)
            },
          })
        }}
      />
    </Main>
  )
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}
function numberValue(value: unknown, fallback: number) {
  return typeof value === 'number' ? value : fallback
}
function arrayValue<T extends string>(value: unknown): T[] | undefined {
  return Array.isArray(value) && value.length ? (value as T[]) : undefined
}
function apiMessage(error: unknown, fallback: string) {
  return isAxiosError<{ message?: string }>(error)
    ? (error.response?.data.message ?? fallback)
    : fallback
}

function dedupeOptions<T extends { value: string }>(items: T[]) {
  return [...new Map(items.map((item) => [item.value, item])).values()]
}

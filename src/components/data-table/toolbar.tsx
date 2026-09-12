import { useEffect, useRef } from 'react'
import { Cross2Icon } from '@radix-ui/react-icons'
import { type Table } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTableFacetedFilter } from './faceted-filter'
import { DataTableViewOptions } from './view-options'

type DataTableToolbarProps<TData> = {
  table: Table<TData>
  searchPlaceholder?: string
  searchKey?: string
  searchDebounceMs?: number
  additionalFilters?: React.ReactNode
  hasAdditionalFilters?: boolean
  onResetAdditionalFilters?: () => void
  className?: string
  controlsClassName?: string
  searchInputClassName?: string
  showViewOptions?: boolean
  filters?: {
    columnId: string
    title: string
    options: {
      label: string
      value: string
      icon?: React.ComponentType<{ className?: string }>
    }[]
  }[]
}

export function DataTableToolbar<TData>({
  table,
  searchPlaceholder = 'Filter...',
  searchKey,
  searchDebounceMs = 0,
  additionalFilters,
  hasAdditionalFilters = false,
  onResetAdditionalFilters,
  className,
  controlsClassName,
  searchInputClassName,
  showViewOptions = true,
  filters = [],
}: DataTableToolbarProps<TData>) {
  const isFiltered =
    table.getState().columnFilters.length > 0 ||
    table.getState().globalFilter ||
    hasAdditionalFilters
  const tableGlobalFilter = (table.getState().globalFilter as string) ?? ''
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )

  useEffect(
    () => () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    },
    []
  )

  const updateGlobalFilter = (value: string, debounce = true) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    if (!searchDebounceMs || !debounce) {
      table.setGlobalFilter(value)
      return
    }
    debounceTimer.current = setTimeout(() => {
      table.setGlobalFilter(value)
    }, searchDebounceMs)
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-start justify-between gap-2 sm:items-center',
        className
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2',
          controlsClassName
        )}
      >
        {searchKey ? (
          <Input
            placeholder={searchPlaceholder}
            value={
              (table.getColumn(searchKey)?.getFilterValue() as string) ?? ''
            }
            onChange={(event) =>
              table.getColumn(searchKey)?.setFilterValue(event.target.value)
            }
            className={cn('h-8 w-37.5 lg:w-62.5', searchInputClassName)}
          />
        ) : (
          <Input
            key={tableGlobalFilter}
            placeholder={searchPlaceholder}
            defaultValue={tableGlobalFilter}
            onChange={(event) => updateGlobalFilter(event.target.value)}
            className={cn('h-8 w-37.5 lg:w-62.5', searchInputClassName)}
          />
        )}
        <div className='flex max-w-full flex-wrap gap-2'>
          {additionalFilters}
          {filters.map((filter) => {
            const column = table.getColumn(filter.columnId)
            if (!column) return null
            return (
              <DataTableFacetedFilter
                key={filter.columnId}
                column={column}
                title={filter.title}
                options={filter.options}
              />
            )
          })}
        </div>
        {isFiltered && (
          <Button
            variant='ghost'
            onClick={() => {
              table.resetColumnFilters()
              updateGlobalFilter('', false)
              onResetAdditionalFilters?.()
            }}
            className='h-8 px-2 lg:px-3'
          >
            Reset
            <Cross2Icon className='ms-2 h-4 w-4' />
          </Button>
        )}
      </div>
      {showViewOptions && <DataTableViewOptions table={table} />}
    </div>
  )
}

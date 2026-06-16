import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../lib/utils.js'
import {
  Combobox,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxValue,
  useComboboxAnchor,
} from './ui/combobox.js'

export interface RemoteMultiComboboxProps<T> {
  value: readonly T[]
  onValueChange: (value: T[]) => void
  search: (query: string) => Promise<T[]>
  getItemValue: (item: T) => string
  getItemLabel: (item: T) => string
  getItemTestId?: (item: T) => string
  renderItem?: (item: T) => React.ReactNode
  placeholder?: string
  emptyMessage?: string
  className?: string
  testId?: string
}

export function RemoteMultiCombobox<T>({
  value,
  onValueChange,
  search,
  getItemValue,
  getItemLabel,
  getItemTestId,
  renderItem,
  placeholder = 'Search...',
  emptyMessage = 'No results found.',
  className,
  testId,
}: RemoteMultiComboboxProps<T>): React.ReactElement {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<T[]>([])
  const [loading, setLoading] = React.useState(false)
  const anchor = useComboboxAnchor()
  const searchRef = React.useRef(search)
  const inputRef = React.useRef<HTMLInputElement>(null)
  searchRef.current = search

  React.useEffect(() => {
    if (!query) {
      setResults([])
      return
    }

    const timer = setTimeout(() => {
      void (async () => {
        setLoading(true)
        try {
          const data = await searchRef.current(query)
          setResults(data)
        } catch {
          setResults([])
        } finally {
          setLoading(false)
        }
      })()
    }, 500)

    return () => clearTimeout(timer)
  }, [query])

  const itemToStringValue = React.useCallback(
    (item: T) => getItemValue(item),
    [getItemValue],
  )

  const handleValueChange = React.useCallback(
    (next: T[]) => {
      onValueChange(next)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    },
    [onValueChange],
  )

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid={testId}>
      <Combobox
        multiple
        items={results}
        value={[...value]}
        onValueChange={handleValueChange}
        onInputValueChange={setQuery}
        itemToStringValue={itemToStringValue}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(values: readonly T[]) => (
              <>
                {values.map((item: T) => (
                  <ComboboxChip key={getItemValue(item)}>
                    {getItemLabel(item)}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput
                  ref={inputRef}
                  data-testid={testId ? `${testId}-input` : undefined}
                  placeholder={values.length === 0 ? placeholder : ''}
                />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent
          anchor={anchor}
          data-testid={testId ? `${testId}-content` : undefined}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground bg-panel">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching remote results...
            </div>
          ) : results.length === 0 ? (
            <ComboboxEmpty className="bg-panel">
              {query ? emptyMessage : 'Start typing to see suggestions...'}
            </ComboboxEmpty>
          ) : (
            <ComboboxList>
              {(item: T) => (
                <ComboboxItem
                  key={itemToStringValue(item)}
                  value={item}
                  data-testid={getItemTestId?.(item)}
                >
                  {renderItem ? (
                    renderItem(item)
                  ) : (
                    <span className="truncate font-mono text-[11px]">
                      {getItemLabel(item)}
                    </span>
                  )}
                </ComboboxItem>
              )}
            </ComboboxList>
          )}
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

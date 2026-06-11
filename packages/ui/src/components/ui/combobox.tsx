import * as React from 'react'
import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import { ChevronDown, X, Check } from 'lucide-react'
import { cn } from '../../lib/utils.js'
import { Button } from './button.js'

const Combobox = ComboboxPrimitive.Root

function ComboboxValue(props: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn('flex items-center justify-center', className)}
      {...props}
    >
      {children}
      <ChevronDown className="pointer-events-none size-3.5 shrink-0 opacity-50" />
    </ComboboxPrimitive.Trigger>
  )
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<Button variant="ghost" size="iconXs" className={cn('size-auto p-0.5', className)} />}
      {...props}
    >
      <X className="size-3" />
    </ComboboxPrimitive.Clear>
  )
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean
  showClear?: boolean
}) {
  return (
    <div
      data-slot="combobox-input"
      className={cn(
        'flex w-full items-center gap-1 rounded-md border border-input bg-background/50 px-3 py-1.5 text-xs ring-offset-background',
        'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        'has-data-disabled:pointer-events-none has-data-disabled:opacity-50',
        className,
      )}
    >
      <ComboboxPrimitive.Input
        disabled={disabled}
        className={cn(
          'flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground',
        )}
        {...props}
      />
      <div className="flex items-center gap-0.5">
        {showClear && <ComboboxClear disabled={disabled} />}
        {showTrigger && (
          <ComboboxTrigger disabled={disabled}>
            <ChevronDown className="size-3.5 shrink-0 opacity-50" />
          </ComboboxTrigger>
        )}
      </div>
      {children}
    </div>
  )
}

const ComboboxContent = React.forwardRef<
  HTMLDivElement,
  ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'>
>(function ComboboxContent({ className, side = 'bottom', sideOffset = 4, align = 'start', alignOffset = 0, anchor, ...props }, forwardedRef) {
  const [popupEl, setPopupEl] = React.useState<HTMLDivElement | null>(null)
  const stableRef = React.useCallback((el: HTMLDivElement | null) => {
    setPopupEl(el)
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }, [forwardedRef])

  React.useEffect(() => {
    const el = popupEl
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      el.scrollTop += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => el.removeEventListener('wheel', onWheel)
  }, [popupEl])

  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50 pointer-events-auto"
      >
        <ComboboxPrimitive.Popup
          ref={stableRef}
          data-slot="combobox-content"
          style={{ overflowY: 'scroll', maxHeight: '12rem' }}
          className={cn(
            'studio-scrollbar relative w-[--anchor-width] min-w-[calc(var(--anchor-width)+28px)] origin-[--transform-origin] rounded-md border bg-panel text-foreground shadow-lg',
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )
})
ComboboxContent.displayName = 'ComboboxContent'

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn('bg-panel py-1', className)}
      {...props}
    />
  )
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        'studio-command-item relative mx-1 flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none select-none',
        'data-disabled:pointer-events-none data-disabled:opacity-50',
        'data-[highlighted]:border-border data-[highlighted]:bg-accent/85 data-[highlighted]:text-accent-foreground',
        className,
      )}
      {...props}
    >
      <span className="flex size-4 shrink-0 items-center justify-center rounded-sm border border-primary transition-colors">
        <ComboboxPrimitive.ItemIndicator>
          <Check className="size-3 text-primary-foreground" />
        </ComboboxPrimitive.ItemIndicator>
      </span>
      {children}
    </ComboboxPrimitive.Item>
  )
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn('', className)}
      {...props}
    />
  )
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn(
        'px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function ComboboxCollection(props: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn('py-8 text-center text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn('mx-2 my-1 h-px bg-border/70', className)}
      {...props}
    />
  )
}

const ComboboxChips = React.forwardRef<
  HTMLDivElement,
  ComboboxPrimitive.Chips.Props
>(({ className, ...props }, ref) => (
  <ComboboxPrimitive.Chips
    ref={ref}
    data-slot="combobox-chips"
    className={cn(
      'flex min-h-8 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-background/50 px-2 py-1 text-xs ring-offset-background',
      'focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
      'has-data-disabled:pointer-events-none has-data-disabled:opacity-50',
      className,
    )}
    {...props}
  />
))
ComboboxChips.displayName = 'ComboboxChips'

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'flex items-center gap-1 rounded-sm bg-accent/40 px-1.5 py-0.5 font-mono text-[10px]',
        'has-data-disabled:pointer-events-none has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="iconXs" className="size-auto p-0.5" />}
        >
          <X className="size-2.5" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  )
}

const ComboboxChipsInput = React.forwardRef<
  HTMLInputElement,
  ComboboxPrimitive.Input.Props
>(({ className, ...props }, ref) => (
  <ComboboxPrimitive.Input
    ref={ref}
    data-slot="combobox-chip-input"
    className={cn(
      'min-w-16 flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground',
      className,
    )}
    {...props}
  />
))
ComboboxChipsInput.displayName = 'ComboboxChipsInput'

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  ComboboxClear,
  useComboboxAnchor,
}

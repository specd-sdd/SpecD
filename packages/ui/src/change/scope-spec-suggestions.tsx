import * as React from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '../lib/utils.js'
import { Button } from '../components/ui/button.js'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../components/ui/command.js'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../components/ui/popover.js'

export function ScopeSpecIdInput({
  value,
  onChange,
  placeholder,
  disabled,
  specIds = [],
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled?: boolean
  specIds?: readonly string[]
  className?: string
}): React.ReactElement {
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-mono text-xs shadow-none border-border/60 bg-background/50 hover:bg-background/80 hover:border-primary/30",
            !value && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={`Search ${placeholder}...`} className="h-8 text-xs" />
          <CommandList className="max-h-[300px] studio-scrollbar">
            <CommandEmpty className="py-2 text-center text-xs">No spec found.</CommandEmpty>
            <CommandGroup>
              {specIds.map((id) => (
                <CommandItem
                  key={id}
                  value={id}
                  onSelect={(currentValue) => {
                    onChange(currentValue)
                    setOpen(false)
                  }}
                  className="font-mono text-[10px]"
                >
                  <Check
                    className={cn(
                      "mr-2 h-3.5 w-3.5",
                      value === id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {id}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

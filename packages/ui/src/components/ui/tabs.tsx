import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, children, ...props }, ref) => {
  const [showLeftArrow, setShowLeftArrow] = React.useState(false)
  const [showRightArrow, setShowRightArrow] = React.useState(false)
  const internalRef = React.useRef<HTMLDivElement>(null)

  const checkOverflow = React.useCallback(() => {
    const el = internalRef.current
    if (el) {
      setShowLeftArrow(el.scrollLeft > 0)
      setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
    }
  }, [])

  React.useEffect(() => {
    checkOverflow()
    const el = internalRef.current
    if (!el) return

    const observer = new ResizeObserver(checkOverflow)
    observer.observe(el)
    return () => observer.disconnect()
  }, [checkOverflow])

  React.useImperativeHandle(ref, () => internalRef.current as any)

  const scroll = (direction: "left" | "right") => {
    const el = internalRef.current
    if (el) {
      const scrollAmount = el.clientWidth * 0.7
      el.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      })
    }
  }

  return (
    <div className="group/tabs-list relative flex w-full min-h-9 items-stretch overflow-hidden border-b border-border bg-panel-header">
      <TabsPrimitive.List
        ref={internalRef}
        onScroll={checkOverflow}
        className={cn(
          "no-scrollbar flex flex-1 items-center justify-start gap-1 overflow-x-auto px-2 py-1.5 text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
      </TabsPrimitive.List>

      {(showLeftArrow || showRightArrow) && (
        <div className="flex shrink-0 items-center gap-0.5 border-l border-border bg-panel-header/50 px-1.5">
          <button
            type="button"
            onClick={() => scroll("left")}
            disabled={!showLeftArrow}
            className="flex size-6 items-center justify-center rounded-sm border border-border bg-background/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            disabled={!showRightArrow}
            className="flex size-6 items-center justify-center rounded-sm border border-border bg-background/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
})
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-md border border-transparent px-2.5 py-1 text-xs font-medium text-muted-foreground ring-offset-background transition-colors duration-150 hover:border-border hover:bg-accent/80 hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-border data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }

import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import * as React from 'react'
import { cn } from '../lib/utils.js'

export type MermaidBlockProps = {
  source: string
  /** Studio document theme used to pick the Mermaid palette. */
  theme: 'dark' | 'light'
}

const ZOOM_FACTOR = 1.25
const MIN_SCALE = 0.5
const MAX_SCALE = 3

let mermaidRenderCounter = 0

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

/**
 * Make Mermaid's SVG fill its zoom wrapper via viewBox (vector-crisp).
 * Mermaid often sets fixed max-width/height in `style`, which blocks real zoom.
 */
function normalizeMermaidSvg(svgEl: SVGSVGElement): void {
  const widthAttr = svgEl.getAttribute('width') ?? ''
  const heightAttr = svgEl.getAttribute('height') ?? ''
  const attrWidth = /%/.test(widthAttr) ? NaN : parseFloat(widthAttr)
  const attrHeight = /%/.test(heightAttr) ? NaN : parseFloat(heightAttr)
  let vbWidth = Number.isFinite(attrWidth) && attrWidth > 0 ? attrWidth : 0
  let vbHeight = Number.isFinite(attrHeight) && attrHeight > 0 ? attrHeight : 0

  const existingViewBox = svgEl.getAttribute('viewBox')
  if (existingViewBox) {
    const parts = existingViewBox.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const viewBoxWidth = parts[2]
      const viewBoxHeight = parts[3]
      if (vbWidth <= 0 && viewBoxWidth !== undefined) vbWidth = viewBoxWidth
      if (vbHeight <= 0 && viewBoxHeight !== undefined) vbHeight = viewBoxHeight
    }
  } else if (vbWidth > 0 && vbHeight > 0) {
    svgEl.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`)
  } else {
    try {
      const box = svgEl.getBBox()
      if (box.width > 0 && box.height > 0) {
        vbWidth = box.width
        vbHeight = box.height
        svgEl.setAttribute('viewBox', `0 0 ${vbWidth} ${vbHeight}`)
      }
    } catch {
      // keep whatever Mermaid emitted
    }
  }

  // Preserve background from Mermaid's style, drop fixed size caps.
  const background =
    svgEl.style.backgroundColor ||
    svgEl.style.background ||
    ''

  svgEl.setAttribute('width', '100%')
  svgEl.removeAttribute('height')
  svgEl.style.cssText = ''
  svgEl.style.width = '100%'
  svgEl.style.height = 'auto'
  svgEl.style.maxWidth = 'none'
  svgEl.style.display = 'block'
  if (background) {
    svgEl.style.backgroundColor = background
  }

  if (vbWidth > 0 && vbHeight > 0) {
    // Aspect-ratio keeps layout height correct while width follows the zoom wrapper.
    svgEl.style.aspectRatio = `${vbWidth} / ${vbHeight}`
  }
}

/**
 * Lazily renders a read-only Mermaid diagram with crisp SVG zoom/pan and failure fallback.
 */
export function MermaidBlock({ source, theme }: MermaidBlockProps): React.ReactElement {
  const renderId = React.useId().replace(/:/g, '')
  const [state, setState] = React.useState<'loading' | 'ready' | 'error'>('loading')
  const [svg, setSvg] = React.useState('')
  const [errorMessage, setErrorMessage] = React.useState('')
  const [scale, setScale] = React.useState(1)
  const [translate, setTranslate] = React.useState({ x: 0, y: 0 })
  const canvasRef = React.useRef<HTMLDivElement | null>(null)
  const panRef = React.useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)
  const [panning, setPanning] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    const diagramId = `studio-mermaid-${renderId}-${++mermaidRenderCounter}`

    async function renderDiagram(): Promise<void> {
      setState('loading')
      setErrorMessage('')
      setScale(1)
      setTranslate({ x: 0, y: 0 })
      try {
        const { default: mermaid } = await import('mermaid')
        mermaid.initialize({
          startOnLoad: false,
          theme: theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'strict',
        })
        const { svg: renderedSvg } = await mermaid.render(diagramId, source)
        if (!cancelled) {
          setSvg(renderedSvg)
          setState('ready')
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to render Mermaid diagram',
          )
          setState('error')
        }
      }
    }

    void renderDiagram()
    return () => {
      cancelled = true
    }
  }, [renderId, source, theme])

  React.useEffect(() => {
    if (state !== 'ready' || !svg || !canvasRef.current) {
      return
    }
    const canvas = canvasRef.current
    canvas.innerHTML = svg
    const svgEl = canvas.querySelector('svg')
    if (svgEl instanceof SVGSVGElement) {
      normalizeMermaidSvg(svgEl)
    }
  }, [state, svg])

  function resetView(): void {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
  }

  function zoomIn(): void {
    setScale((current) => clampScale(current * ZOOM_FACTOR))
  }

  function zoomOut(): void {
    setScale((current) => clampScale(current / ZOOM_FACTOR))
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: translate.x,
      originY: translate.y,
    }
    setPanning(true)
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) {
      return
    }
    setTranslate({
      x: pan.originX + (event.clientX - pan.startX),
      y: pan.originY + (event.clientY - pan.startY),
    })
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>): void {
    const pan = panRef.current
    if (!pan || pan.pointerId !== event.pointerId) {
      return
    }
    panRef.current = null
    setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  if (state === 'loading') {
    return <p className="studio-mermaid-block text-xs text-muted-foreground">Loading diagram…</p>
  }

  if (state === 'error') {
    return (
      <div className="studio-mermaid-block studio-mermaid-block--error space-y-2">
        <pre className="overflow-x-auto rounded border border-border bg-background/60 p-2">
          <code className="font-mono text-[11px] text-foreground">{source}</code>
        </pre>
        <p className="text-xs text-destructive">{errorMessage}</p>
      </div>
    )
  }

  return (
    <div className="studio-mermaid-block studio-mermaid-block--ready relative">
      <div
        className="studio-mermaid-toolbar absolute right-2 top-2 z-10 flex gap-0.5 rounded border border-border bg-panel/95 p-0.5 shadow-sm"
        role="toolbar"
        aria-label="Diagram zoom controls"
      >
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground"
          aria-label="Zoom in"
          onClick={(event) => {
            event.stopPropagation()
            zoomIn()
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ZoomIn className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground"
          aria-label="Zoom out"
          onClick={(event) => {
            event.stopPropagation()
            zoomOut()
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <ZoomOut className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background/80 hover:text-foreground"
          aria-label="Reset view"
          onClick={(event) => {
            event.stopPropagation()
            resetView()
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      <div
        className={cn(
          'studio-mermaid-viewport overflow-hidden',
          panning ? 'cursor-grabbing' : 'cursor-grab',
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
      >
        {/*
          Zoom by sizing the wrapper (% of viewport). The SVG fills 100% width with a
          fixed viewBox, so the diagram itself scales as a vector — not just the
          Mermaid background fill.
        */}
        <div
          className="studio-mermaid-zoom-layer"
          data-testid="mermaid-zoom-layer"
          data-scale={scale}
          style={{
            width: `${scale * 100}%`,
            transform: `translate(${translate.x}px, ${translate.y}px)`,
          }}
        >
          <div ref={canvasRef} className="studio-mermaid-canvas" data-testid="mermaid-canvas" />
        </div>
      </div>
    </div>
  )
}

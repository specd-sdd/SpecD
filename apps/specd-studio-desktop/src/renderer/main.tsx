import { SpecdApp } from '@specd/ui'
import '@specd/ui/styles.css'
import { StrictMode, useEffect, useState, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

function DesktopBootstrap(): ReactElement {
  const [ipcReady, setIpcReady] = useState(false)
  const [ipcError, setIpcError] = useState<string | undefined>()

  useEffect(() => {
    if (!window.specd) {
      setIpcError('Preload bridge unavailable')
      return
    }
    void window.specd
      .ping()
      .then(() => setIpcReady(true))
      .catch((err: unknown) => {
        setIpcError(err instanceof Error ? err.message : String(err))
        setIpcReady(true)
      })
  }, [])

  if (!ipcReady) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Starting SpecD Studio…
      </div>
    )
  }

  if (ipcError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Local IPC is not wired yet. Connect to a remote API to use the IDE shell.
        </p>
        <p className="text-xs text-destructive">{ipcError}</p>
        <div className="h-[70vh] w-full max-w-5xl">
          <SpecdApp mode="desktop" className="h-full w-full" />
        </div>
      </div>
    )
  }

  return <SpecdApp mode="desktop" className="h-screen w-screen" />
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <DesktopBootstrap />
  </StrictMode>,
)

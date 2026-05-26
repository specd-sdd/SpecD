import { SpecdApp, type SpecdAppProps } from '@specd/ui'
import '@specd/ui/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

/** API base from `specd ui serve` (`SPECD_API_BASE_URL` → Vite define). */
function resolveInjectedConnectionProfile(): SpecdAppProps['connectionProfile'] {
  const raw = import.meta.env.VITE_SPECD_API_BASE_URL
  if (typeof raw !== 'string' || raw.length === 0) {
    return undefined
  }
  const apiBaseUrl = raw.replace(/\/v1\/?$/u, '')
  return { kind: 'remote', apiBaseUrl }
}

const connectionProfile = resolveInjectedConnectionProfile()

createRoot(root).render(
  <StrictMode>
    <SpecdApp
      mode="standalone"
      {...(connectionProfile !== undefined ? { connectionProfile } : {})}
    />
  </StrictMode>,
)

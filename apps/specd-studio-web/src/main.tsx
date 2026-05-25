import { SpecdApp } from '@specd/ui'
import '@specd/ui/styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <SpecdApp mode="standalone" />
  </StrictMode>,
)

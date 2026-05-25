import type { SpecdDataPort } from '@specd/client'
import * as React from 'react'

const SpecdDataContext = React.createContext<SpecdDataPort | null>(null)

export function SpecdDataProvider({
  port,
  children,
}: {
  port: SpecdDataPort
  children: React.ReactNode
}): React.ReactElement {
  return <SpecdDataContext.Provider value={port}>{children}</SpecdDataContext.Provider>
}

export function useSpecdDataPort(): SpecdDataPort {
  const port = React.useContext(SpecdDataContext)
  if (!port) {
    throw new Error('useSpecdDataPort requires SpecdDataProvider')
  }
  return port
}

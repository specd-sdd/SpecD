import type { DraftAwareIpcMethod } from '@specd/client'
import type { DesktopRecentConnection, DesktopSession } from '../preload/bridge.js'

export {}

declare global {
  interface Window {
    specd?: {
      platform: string
      ping: () => Promise<unknown>
      invoke: (method: string, payload?: unknown) => Promise<unknown>
      draftAwareMethods: readonly DraftAwareIpcMethod[]
      storage: {
        get: <T>(key: string) => T | null
        set: <T>(key: string, value: T) => void
        remove: (key: string) => void
      }
      onSessionChange: (callback: (session: DesktopSession) => void) => () => void
      onSelectRecent: (callback: (recent: DesktopRecentConnection) => void) => () => void
      onTriggerOpenProject: (callback: () => void) => () => void
      onTriggerClearRecents: (callback: () => void) => () => void
      onTriggerClose: (callback: () => void) => () => void
    }
  }
}

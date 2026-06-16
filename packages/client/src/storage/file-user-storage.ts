import { IUserStorage } from './user-storage-port.js'

type DesktopStorageBridge = {
  readonly storage: {
    get: <T>(key: string) => T | null
    set: <T>(key: string, value: T) => void
    remove: (key: string) => void
  }
}

function resolveDesktopStorageBridge(): DesktopStorageBridge | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }
  const desktopWindow = window as Window & { specd?: DesktopStorageBridge }
  return desktopWindow.specd
}

/**
 * Implementation of {@link IUserStorage} that persists settings under Electron's `userData` directory.
 * Coordinates synchronously with the main process via the preload bridge `window.specd.storage`.
 */
export class FileUserStorage implements IUserStorage {
  get<T>(key: string): T | null {
    return resolveDesktopStorageBridge()?.storage.get<T>(key) ?? null
  }

  set<T>(key: string, value: T): void {
    resolveDesktopStorageBridge()?.storage.set(key, value)
  }

  remove(key: string): void {
    resolveDesktopStorageBridge()?.storage.remove(key)
  }
}

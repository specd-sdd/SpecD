import { IUserStorage } from './user-storage-port.js'

/**
 * Implementation of {@link IUserStorage} that persists data in the browser's native `localStorage`.
 */
export class LocalStorageUserStorage implements IUserStorage {
  get<T>(key: string): T | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null
    }
    const item = window.localStorage.getItem(key)
    if (!item) {
      return null
    }
    try {
      return JSON.parse(item) as T
    } catch {
      return null
    }
  }

  set<T>(key: string, value: T): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      console.error('LocalStorageUserStorage set failed:', error)
    }
  }

  remove(key: string): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return
    }
    try {
      window.localStorage.removeItem(key)
    } catch (error) {
      console.error('LocalStorageUserStorage remove failed:', error)
    }
  }
}

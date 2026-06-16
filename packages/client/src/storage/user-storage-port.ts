/**
 * Platform-agnostic interface for KV persistence on the client side.
 * Allows storing configurations like connection profiles and recently opened projects.
 */
export interface IUserStorage {
  /**
   * Retrieves a parsed item from storage.
   * Returns null if key does not exist or parse fails.
   */
  get<T>(key: string): T | null

  /**
   * Serializes and stores a value under the given key.
   */
  set<T>(key: string, value: T): void

  /**
   * Removes the item stored under the given key.
   */
  remove(key: string): void
}

/**
 * Opaque graph-store factory registration carried by the kernel registry.
 *
 * `@specd/core` does not construct code-graph backends directly, so the return type
 * remains intentionally opaque at this layer while preserving the same registry shape
 * used by other extension points.
 */
export interface GraphStoreFactory {
  /**
   * Creates a concrete graph-store backend.
   *
   * @param options - Adapter-owned resolved options
   * @returns The constructed backend instance
   */
  create(options: Readonly<Record<string, unknown>>): unknown
}

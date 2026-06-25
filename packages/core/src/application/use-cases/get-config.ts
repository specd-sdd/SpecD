import { type SpecdConfig } from '../specd-config.js'

/**
 * Host-facing read of the {@link SpecdConfig} snapshot used at kernel construction.
 *
 * Returns a detached clone so hosts cannot mutate live kernel wiring. Persisting
 * yaml changes requires {@link ConfigWriter} composition factories — not in-place
 * edits to the object returned from {@link GetConfig.execute}.
 */
export class GetConfig {
  private readonly _snapshot: SpecdConfig

  /**
   * Captures a construction-time clone of the project configuration.
   *
   * @param config - The `SpecdConfig` passed to `createKernel` or a factory
   */
  constructor(config: SpecdConfig) {
    this._snapshot = structuredClone(config)
  }

  /**
   * Returns the readonly configuration snapshot for host consumers.
   *
   * Does not re-read `specd.yaml`. Recreate the kernel after disk changes.
   *
   * @returns Construction-time `SpecdConfig` snapshot (stable reference per instance)
   */
  execute(): Readonly<SpecdConfig> {
    return this._snapshot
  }
}

import { type ConfigWriter } from '../ports/config-writer.js'

/**
 * Input for the {@link RemovePlugin} use case.
 */
export interface RemovePluginInput {
  /** Absolute path to the `specd.yaml` to update. */
  readonly configPath: string
  /** Plugin type key (for example, `agents`). */
  readonly type: string
  /** Plugin package name. */
  readonly name: string
}

/**
 * Removes one plugin declaration from `specd.yaml`.
 */
export class RemovePlugin {
  private readonly _writer: ConfigWriter

  /**
   * Creates a new `RemovePlugin` use case instance.
   *
   * @param writer - Port for writing project config.
   */
  constructor(writer: ConfigWriter) {
    this._writer = writer
  }

  /**
   * Executes the use case.
   *
   * @param input - Plugin identity payload.
   * @returns A promise that resolves when write completes.
   */
  async execute(input: RemovePluginInput): Promise<void> {
    return this._writer.removePlugin(input.configPath, input.type, input.name)
  }
}

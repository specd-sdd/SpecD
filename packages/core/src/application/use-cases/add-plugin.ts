import { type ConfigWriter } from '../ports/config-writer.js'

/**
 * Input for the {@link AddPlugin} use case.
 */
export interface AddPluginInput {
  /** Absolute path to the `specd.yaml` to update. */
  readonly configPath: string
  /** Plugin type key (for example, `agents`). */
  readonly type: string
  /** Plugin package name. */
  readonly name: string
  /** Optional plugin-specific configuration payload. */
  readonly config?: Record<string, unknown>
}

/**
 * Adds or updates one plugin declaration in `specd.yaml`.
 */
export class AddPlugin {
  private readonly _writer: ConfigWriter

  /**
   * Creates a new `AddPlugin` use case instance.
   *
   * @param writer - Port for writing project config.
   */
  constructor(writer: ConfigWriter) {
    this._writer = writer
  }

  /**
   * Executes the use case.
   *
   * @param input - Plugin declaration payload.
   * @returns A promise that resolves when write completes.
   */
  async execute(input: AddPluginInput): Promise<void> {
    return this._writer.addPlugin(input.configPath, input.type, input.name, input.config)
  }
}

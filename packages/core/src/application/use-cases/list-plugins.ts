import { type ConfigWriter } from '../ports/config-writer.js'

/**
 * Input for the {@link ListPlugins} use case.
 */
export interface ListPluginsInput {
  /** Absolute path to the `specd.yaml` to read. */
  readonly configPath: string
  /** Optional plugin type filter (for example, `agents`). */
  readonly type?: string
}

/**
 * Plugin declaration entry returned from config.
 */
export interface ListPluginsEntry {
  /** Plugin package name. */
  readonly name: string
  /** Optional plugin-specific config payload. */
  readonly config?: Record<string, unknown>
}

/**
 * Lists plugin declarations from `specd.yaml`.
 */
export class ListPlugins {
  private readonly _writer: ConfigWriter

  /**
   * Creates a new `ListPlugins` use case instance.
   *
   * @param writer - Port for reading project plugin declarations.
   */
  constructor(writer: ConfigWriter) {
    this._writer = writer
  }

  /**
   * Executes the use case.
   *
   * @param input - Query payload.
   * @returns Matching plugin declarations.
   */
  async execute(input: ListPluginsInput): Promise<ListPluginsEntry[]> {
    return this._writer.listPlugins(input.configPath, input.type)
  }
}

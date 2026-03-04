import { type ConfigWriter } from '../ports/config-writer.js'

/** Input for the {@link RecordSkillInstall} use case. */
export interface RecordSkillInstallInput {
  /** Absolute path to the `specd.yaml` to update. */
  configPath: string
  /** The agent name (e.g. `'claude'`). */
  agent: string
  /** The skill names to record. */
  skillNames: string[]
}

/**
 * Records that a set of skills was installed for an agent in `specd.yaml`.
 */
export class RecordSkillInstall {
  private readonly _writer: ConfigWriter

  /**
   * Creates a new `RecordSkillInstall` use case instance.
   *
   * @param writer - Port for writing the project configuration
   */
  constructor(writer: ConfigWriter) {
    this._writer = writer
  }

  /**
   * Executes the use case.
   *
   * @param input - Install record parameters
   * @returns Resolves when the config file has been updated
   */
  async execute(input: RecordSkillInstallInput): Promise<void> {
    return this._writer.recordSkillInstall(input.configPath, input.agent, input.skillNames)
  }
}

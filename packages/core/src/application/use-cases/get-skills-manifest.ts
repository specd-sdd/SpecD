import { type ConfigWriter } from '../ports/config-writer.js'

/** Input for the {@link GetSkillsManifest} use case. */
export interface GetSkillsManifestInput {
  /** Absolute path to the `specd.yaml` to read. */
  readonly configPath: string
}

/**
 * Reads the installed skills manifest from `specd.yaml`.
 */
export class GetSkillsManifest {
  private readonly _writer: ConfigWriter

  /**
   * Creates a new `GetSkillsManifest` use case instance.
   *
   * @param writer - Port for reading the project configuration
   */
  constructor(writer: ConfigWriter) {
    this._writer = writer
  }

  /**
   * Executes the use case.
   *
   * @param input - Query parameters
   * @returns A map of agent name → list of installed skill names
   */
  async execute(input: GetSkillsManifestInput): Promise<Record<string, string[]>> {
    return this._writer.readSkillsManifest(input.configPath)
  }
}

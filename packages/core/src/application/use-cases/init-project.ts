import {
  type ConfigWriter,
  type InitProjectOptions,
  type InitProjectResult,
} from '../ports/config-writer.js'

/**
 * Initialises a new specd project by writing `specd.yaml`, creating storage
 * directories, and updating `.gitignore`.
 *
 * Delegates all filesystem operations to the {@link ConfigWriter} port.
 */
export class InitProject {
  private readonly _writer: ConfigWriter

  /**
   * Creates a new `InitProject` use case instance.
   *
   * @param writer - Port for writing the project configuration
   */
  constructor(writer: ConfigWriter) {
    this._writer = writer
  }

  /**
   * Executes the use case.
   *
   * @param input - Initialisation options
   * @returns The path and metadata of the created config
   * @throws {AlreadyInitialisedError} When `specd.yaml` already exists and `force` is not set
   */
  async execute(input: InitProjectOptions): Promise<InitProjectResult> {
    return this._writer.initProject(input)
  }
}

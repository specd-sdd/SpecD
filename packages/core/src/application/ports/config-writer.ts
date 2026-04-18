/** Options for the `initProject` operation. */
export interface InitProjectOptions {
  /** The directory to initialise (absolute path; defaults to process.cwd()). */
  readonly projectRoot: string
  /** Schema reference string (e.g. `'@specd/schema-std'`). */
  readonly schemaRef: string
  /** The default workspace name (e.g. `'default'`). */
  readonly workspaceId: string
  /** Relative path for the specs directory (e.g. `'specs/'`). */
  readonly specsPath: string
  /** When `true`, overwrite an existing `specd.yaml` without error. */
  readonly force?: boolean
}

/** Result returned by the `initProject` operation. */
export interface InitProjectResult {
  /** Absolute path to the created `specd.yaml` file. */
  readonly configPath: string
  /** Schema reference as written. */
  readonly schemaRef: string
  /** Workspace IDs created. */
  readonly workspaces: readonly string[]
}

/**
 * Port for writing and mutating the project configuration (`specd.yaml`).
 *
 * Unlike `ConfigLoader`, which is read-only, `ConfigWriter` handles the
 * operations that create or modify the on-disk configuration.
 */
export interface ConfigWriter {
  /**
   * Creates a new `specd.yaml` in `projectRoot`, creates the required storage
   * directories, and appends `specd.local.yaml` to `.gitignore`.
   *
   * @param options - Initialisation options
   * @returns The path and metadata of the created config
   * @throws {AlreadyInitialisedError} When `specd.yaml` already exists and `force` is not set
   */
  initProject(options: InitProjectOptions): Promise<InitProjectResult>

  /**
   * Adds or updates a plugin declaration under `plugins.<type>`.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param type - Plugin type key (e.g. `'agents'`)
   * @param name - Plugin package name
   * @param config - Optional plugin-specific config
   * @returns A promise that resolves when persistence completes
   */
  addPlugin(
    configPath: string,
    type: string,
    name: string,
    config?: Record<string, unknown>,
  ): Promise<void>

  /**
   * Removes a plugin declaration by name from `plugins.<type>`.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param type - Plugin type key (e.g. `'agents'`)
   * @param name - Plugin package name
   * @returns A promise that resolves when persistence completes
   */
  removePlugin(configPath: string, type: string, name: string): Promise<void>

  /**
   * Lists plugin declarations, optionally filtered by type.
   *
   * @param configPath - Absolute path to the `specd.yaml` to read
   * @param type - Optional plugin type filter
   * @returns Declared plugin entries
   */
  listPlugins(
    configPath: string,
    type?: string,
  ): Promise<Array<{ name: string; config?: Record<string, unknown> }>>
}

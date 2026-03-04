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
   * Records that a skill set was installed for a given agent by merging the
   * skill names into the `skills` key of `specd.yaml`.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param agent - The agent name (e.g. `'claude'`)
   * @param skillNames - The skill names to record
   */
  recordSkillInstall(configPath: string, agent: string, skillNames: string[]): Promise<void>

  /**
   * Reads the `skills` key from `specd.yaml` and returns it, or `{}` if absent.
   *
   * @param configPath - Absolute path to the `specd.yaml` to read
   * @returns A map of agent name → list of installed skill names
   */
  readSkillsManifest(configPath: string): Promise<Record<string, string[]>>
}

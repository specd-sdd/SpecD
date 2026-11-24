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
  /** Project-relative path to the metadata cache directory. */
  readonly metadataCachePath: string
}

/** Optional fields written onto a flat plugin entry. */
export interface AddPluginOptions {
  /** Opaque plugin configuration. Persisted only when provided. */
  readonly config?: Readonly<Record<string, unknown>>
  /** Contribution id allowlist. Persisted only when provided. */
  readonly contributions?: readonly string[]
}

/** One plugin declaration read from the flat `plugins` list. */
export interface ConfigDeclaredPlugin {
  /** Scoped plugin package name. */
  readonly name: string
  /** Plugin configuration, when the entry declares one. */
  readonly config?: Readonly<Record<string, unknown>>
  /** Contribution allowlist, when the entry declares one. */
  readonly contributions?: readonly string[]
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
   * directories, and appends both `specd.local.yaml` and the `specd.local.*.yaml`
   * local-variant pattern to `.gitignore`.
   *
   * @param options - Initialisation options
   * @returns The path and metadata of the created config
   * @throws {AlreadyInitialisedError} When `specd.yaml` already exists and `force` is not set
   */
  initProject(options: InitProjectOptions): Promise<InitProjectResult>

  /**
   * Merges a plugin declaration into the flat `plugins` list.
   *
   * An existing entry with the same `name` keeps fields the caller did not set.
   * `config` and `contributions` are written only when present on `options`.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param name - Scoped plugin package name
   * @param options - Optional config and contribution allowlist
   * @returns A promise that resolves when persistence completes
   */
  addPlugin(configPath: string, name: string, options?: AddPluginOptions): Promise<void>

  /**
   * Removes a plugin declaration by name from the flat `plugins` list.
   *
   * Removing a name that is not declared is a no-op.
   *
   * @param configPath - Absolute path to the `specd.yaml` to update
   * @param name - Scoped plugin package name
   * @returns A promise that resolves when persistence completes
   */
  removePlugin(configPath: string, name: string): Promise<void>

  /**
   * Lists plugin declarations from the flat `plugins` list.
   *
   * @param configPath - Absolute path to the `specd.yaml` to read
   * @returns Declared plugin entries, or an empty list when the file or key is absent
   */
  listPlugins(configPath: string): Promise<ConfigDeclaredPlugin[]>
}

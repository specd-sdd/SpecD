/**
 * Resolved file ready to be installed into a target directory.
 */
export interface ResolvedFile {
  /**
   * Output filename.
   */
  readonly filename: string

  /**
   * Final file content after variable substitution.
   */
  readonly content: string

  /**
   * Marks files that should be routed to a shared install directory.
   */
  readonly shared?: boolean
}

/**
 * Install target options for `SkillBundle` operations.
 */
export interface SkillBundleInstallTarget {
  /**
   * Directory for skill-local files.
   */
  readonly targetDir: string

  /**
   * Optional directory for files marked `shared: true`.
   * Falls back to `targetDir` when omitted.
   */
  readonly sharedTargetDir?: string
}

/**
 * Installable bundle containing all files for one skill.
 */
export interface SkillBundle {
  /**
   * Skill identifier.
   */
  readonly name: string

  /**
   * Skill description.
   */
  readonly description: string

  /**
   * Files to install.
   */
  readonly files: readonly ResolvedFile[]

  /**
   * Installs the bundle into the target directory.
   *
   * @param target - Target directory path or split install targets.
   * @returns A promise that resolves when installation is complete.
   */
  install(target: string | SkillBundleInstallTarget): Promise<void>

  /**
   * Uninstalls bundle files from the target directory.
   *
   * @param target - Target directory path or split install targets.
   * @returns A promise that resolves when uninstall is complete.
   */
  uninstall(target: string | SkillBundleInstallTarget): Promise<void>
}

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
   * @param targetDir - Target directory path.
   * @returns A promise that resolves when installation is complete.
   */
  install(targetDir: string): Promise<void>

  /**
   * Uninstalls bundle files from the target directory.
   *
   * @param targetDir - Target directory path.
   * @returns A promise that resolves when uninstall is complete.
   */
  uninstall(targetDir: string): Promise<void>
}

/**
 * Folder-level metadata contract for one skill template directory.
 */
export interface SkillTemplateMetadata {
  /**
   * Capability identifiers that templates in this folder may reference.
   */
  readonly supportedCapabilities: readonly string[]

  /**
   * Capability identifiers required for this skill to be installable.
   */
  readonly requiredCapabilities: readonly string[]

  /**
   * Shared template filenames required by this skill.
   */
  readonly requiredSharedTemplates: readonly string[]
}

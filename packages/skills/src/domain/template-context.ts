/**
 * Scalar values accepted by the skill template context.
 */
export type SkillTemplateScalar = string | number | boolean

/**
 * Recursive value tree accepted by template variables.
 */
export type SkillTemplateValue =
  | SkillTemplateScalar
  | readonly SkillTemplateValue[]
  | { readonly [key: string]: SkillTemplateValue }

/**
 * Structured render context passed to skill templates during install.
 */
export interface SkillTemplateContext {
  /**
   * Recursive template variables, including `variables.frontmatter`.
   */
  readonly variables?: Readonly<Record<string, SkillTemplateValue>>

  /**
   * Capability identifiers exposed separately from regular variables.
   */
  readonly capabilities?: readonly string[]
}

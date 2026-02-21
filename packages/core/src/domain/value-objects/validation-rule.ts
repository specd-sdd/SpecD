/**
 * A structural validation rule applied to a spec artifact or delta artifact.
 *
 * Used in two distinct contexts:
 *
 * - **`validations[]`** on an `ArtifactType`: rules applied to the *base* spec
 *   file after a delta merge. `scope` is a section heading (e.g. `"Requirements"`).
 *
 * - **`deltaValidations[]`** on an `ArtifactType`: rules applied to the *delta*
 *   file before merging. `scope` is a delta section identifier combining an
 *   operation keyword with a section name (e.g. `"ADDED Requirements"`).
 *
 * In both cases `pattern` is a regex-compatible string (supports `{name}` as a
 * placeholder for any block identifier). `required: true` means the pattern
 * must be present; `required: false` means a warning is shown when absent.
 */
export interface ValidationRule {
  /**
   * A regex-compatible pattern that must (or must not) appear in the target.
   * The placeholder `{name}` may appear in the pattern and is treated as a
   * wildcard matching any block identifier.
   */
  readonly pattern: string

  /**
   * When `true`, the pattern must be present for validation to pass and its
   * absence is a hard error. When `false`, the pattern is advisory — its
   * absence emits a warning but does not fail validation.
   * Defaults to `true` if omitted.
   */
  readonly required: boolean

  /**
   * Restricts matching to a specific section (for `validations`) or delta
   * section (for `deltaValidations`). When omitted, the pattern is checked
   * against the whole file.
   */
  readonly scope?: string

  /**
   * When set, the pattern must match within every block whose header matches
   * this template (e.g. `"### Requirement: {name}"`). `scope` and `eachBlock`
   * are independent and can be combined.
   */
  readonly eachBlock?: string
}

/**
 * A section of a spec artifact that provides relevant context for a skill.
 *
 * `CompileContext` extracts sections listed here from the spec files referenced
 * by a change and injects them into the compiled instruction block.
 */
export interface ContextSection {
  /**
   * The section heading to extract (without the leading `## `),
   * e.g. `"Requirements"`.
   */
  readonly name: string

  /**
   * The title under which this section appears in the compiled instruction
   * block. Defaults to `name` if omitted.
   */
  readonly contextTitle?: string
}

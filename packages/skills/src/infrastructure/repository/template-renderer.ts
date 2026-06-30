import Handlebars from 'handlebars'
import { stringify } from 'yaml'
import type { SkillTemplateContext, SkillTemplateValue } from '../../domain/template-context.js'

/**
 * Input used by `TemplateRenderer.render()`.
 */
export interface RenderTemplateInput {
  /**
   * Raw template source.
   */
  readonly templateSource: string

  /**
   * Structured install-time render context.
   */
  readonly context: SkillTemplateContext

  /**
   * Whether the current file may receive runtime frontmatter.
   */
  readonly includeFrontmatter: boolean
}

/**
 * Renders markdown templates from structured install-time context.
 */
export class TemplateRenderer {
  /**
   * Renders one template source string.
   *
   * @param input - Template source and render context.
   * @returns Rendered markdown content.
   */
  render(input: RenderTemplateInput): string {
    const capabilityMap = this.normalizeCapabilities(input.context.capabilities ?? [])
    const frontmatter =
      input.includeFrontmatter && capabilityMap['frontmatter'] === true
        ? this.composeFrontmatterFromContext(input.context.variables?.['frontmatter'])
        : undefined

    const template = Handlebars.compile(input.templateSource, { noEscape: true })
    return template({
      ...(input.context.variables ?? {}),
      variables: input.context.variables ?? {},
      capabilities: capabilityMap,
      frontmatter,
    })
  }

  /**
   * Composes YAML frontmatter from structured values.
   *
   * @param values - Structured frontmatter field map.
   * @returns YAML frontmatter block or an empty string.
   */
  composeFrontmatter(values: Readonly<Record<string, SkillTemplateValue>>): string {
    if (Object.keys(values).length === 0) {
      return ''
    }

    const yamlBody = stringify(this.toPlainValue(values), {
      indent: 2,
      lineWidth: 0,
      minContentWidth: 0,
    }).trimEnd()

    return `---\n${yamlBody}\n---\n`
  }

  /**
   * Normalizes capability entries to a lookup map.
   *
   * @param values - Capability collection from install-time context.
   * @returns Capability lookup keyed by capability type.
   */
  normalizeCapabilities(values: readonly string[]): Record<string, boolean> {
    const capabilities: Record<string, boolean> = {}
    for (const capability of values) {
      capabilities[capability] = true
    }
    return capabilities
  }

  /**
   * Removes the trailing `.tpl` suffix from emitted filenames.
   *
   * @param filename - Template source filename.
   * @returns Output filename used by install bundles.
   */
  normalizeOutputFilename(filename: string): string {
    return filename.endsWith('.tpl') ? filename.slice(0, -4) : filename
  }

  /**
   * Composes frontmatter from `variables.frontmatter` when available.
   *
   * @param value - Frontmatter source value from the render context.
   * @returns YAML frontmatter block or an empty string.
   */
  private composeFrontmatterFromContext(value: SkillTemplateValue | undefined): string {
    if (
      value === undefined ||
      Array.isArray(value) ||
      this.isScalar(value) ||
      !this.isTemplateObject(value)
    ) {
      return ''
    }

    return this.composeFrontmatter(value)
  }

  /**
   * Converts recursive template values to plain JS values for YAML serialization.
   *
   * @param value - Recursive template value.
   * @returns Plain scalar, array, or object tree.
   */
  private toPlainValue(value: SkillTemplateValue): unknown {
    if (this.isScalar(value)) {
      return value
    }

    if (Array.isArray(value)) {
      return value.map((entry: SkillTemplateValue) => this.toPlainValue(entry))
    }

    const objectValue: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      objectValue[key] = this.toPlainValue(entry)
    }

    return objectValue
  }

  /**
   * Checks whether a template value is scalar.
   *
   * @param value - Candidate value.
   * @returns `true` when the value is a scalar.
   */
  private isScalar(value: SkillTemplateValue): value is string | number | boolean {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  }

  /**
   * Checks whether a template value is a nested object map.
   *
   * @param value - Candidate value.
   * @returns `true` when the value is an object map.
   */
  private isTemplateObject(
    value: SkillTemplateValue | Readonly<Record<string, SkillTemplateValue>>,
  ): value is Readonly<Record<string, SkillTemplateValue>> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
  }
}

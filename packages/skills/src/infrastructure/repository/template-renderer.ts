import Handlebars from 'handlebars'
import { stringify } from 'yaml'
import type {
  SkillTemplateContext,
  SkillTemplateScalar,
  SkillTemplateValue,
} from '../../domain/template-context.js'

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g
const FRONTMATTER_TOKEN = '{{{frontmatter}}}'

/**
 * Sentinel mapping used to restore unresolved placeholders after rendering.
 */
interface PreservedPlaceholder {
  readonly sentinel: string
  readonly source: string
}

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

    const { source, placeholders } = this.preserveMissingSimpleVariables(
      input.templateSource,
      input.context.variables ?? {},
    )
    const template = Handlebars.compile(source, { noEscape: true })
    const rendered = template({
      ...(input.context.variables ?? {}),
      variables: input.context.variables ?? {},
      capabilities: capabilityMap,
      frontmatter,
    })

    return this.restorePreservedPlaceholders(rendered, placeholders)
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
   * Replaces missing simple variables with sentinels before Handlebars rendering.
   *
   * @param source - Raw template source.
   * @param variables - Recursive variable map.
   * @returns Rewritten source plus placeholder restore metadata.
   */
  private preserveMissingSimpleVariables(
    source: string,
    variables: Readonly<Record<string, SkillTemplateValue>>,
  ): { source: string; placeholders: readonly PreservedPlaceholder[] } {
    const placeholders: PreservedPlaceholder[] = []
    const rewritten = source.replaceAll(PLACEHOLDER_PATTERN, (match, key: string) => {
      if (match === FRONTMATTER_TOKEN || key === 'else') {
        return match
      }

      const value = this.lookupVariable(variables, key)
      if (value === undefined) {
        const sentinel = `@@SPECD_PLACEHOLDER_${placeholders.length}@@`
        placeholders.push({ sentinel, source: match })
        return sentinel
      }

      if (Array.isArray(value) || this.isTemplateObject(value)) {
        return match
      }

      if (!this.isScalar(value)) {
        return match
      }

      return this.stringifyScalar(value)
    })

    return { source: rewritten, placeholders }
  }

  /**
   * Restores preserved placeholders after Handlebars completes rendering.
   *
   * @param rendered - Handlebars output.
   * @param placeholders - Sentinel-to-source mapping.
   * @returns Output with unresolved placeholders restored.
   */
  private restorePreservedPlaceholders(
    rendered: string,
    placeholders: readonly PreservedPlaceholder[],
  ): string {
    let output = rendered
    for (const placeholder of placeholders) {
      output = output.replaceAll(placeholder.sentinel, placeholder.source)
    }
    return output
  }

  /**
   * Looks up a nested variable path within the recursive variable map.
   *
   * @param variables - Recursive variables object.
   * @param key - Dot-separated lookup path.
   * @returns Resolved value, or `undefined` when absent.
   */
  private lookupVariable(
    variables: Readonly<Record<string, SkillTemplateValue>>,
    key: string,
  ): SkillTemplateValue | undefined {
    const segments = key.split('.')
    let current: SkillTemplateValue | Readonly<Record<string, SkillTemplateValue>> | undefined =
      variables

    for (const segment of segments) {
      if (
        current === undefined ||
        Array.isArray(current) ||
        this.isScalar(current) ||
        !this.isTemplateObject(current)
      ) {
        return undefined
      }
      current = current[segment]
    }

    return current
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
  private isScalar(value: SkillTemplateValue): value is SkillTemplateScalar {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
  }

  /**
   * Serializes a scalar template value without falling back to object stringification.
   *
   * @param value - Scalar template value.
   * @returns String form safe for placeholder preservation.
   */
  private stringifyScalar(value: SkillTemplateScalar): string {
    if (typeof value === 'string') {
      return value
    }

    return value.toString()
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

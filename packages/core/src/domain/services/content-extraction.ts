import {
  type Extractor,
  type ExtractorTransformDeclaration,
  type FieldMapping,
} from '../value-objects/extractor.js'
import { type Selector } from '../value-objects/selector.js'
import { ExtractorTransformError } from '../errors/extractor-transform-error.js'
import {
  type SelectorNode,
  type NodeMatch,
  findNodes,
  findNodesWithAncestors,
  nodeMatches,
} from './selector-matching.js'
import { safeRegex } from './safe-regex.js'

/** Renderer contract for serializing AST subtrees to text. */
export interface SubtreeRenderer {
  renderSubtree(node: SelectorNode): string
}

/** Opaque caller-owned context bag forwarded to extractor transforms. */
export type ExtractorTransformContext = ReadonlyMap<string, unknown>

/**
 * Callback contract for extractor transforms.
 *
 */
export type ExtractorTransformResult = string | Promise<string>

/**
 * Callback contract for extractor transforms.
 */
export type ExtractorTransform = (
  value: string,
  args: readonly (string | undefined)[],
  context: ExtractorTransformContext,
) => ExtractorTransformResult

/** Registry of extractor transforms keyed by registered transform name. */
export type ExtractorTransformRegistry = ReadonlyMap<string, ExtractorTransform>

/** A grouped extraction result (e.g. rules grouped by requirement label). */
export interface GroupedExtraction {
  readonly label: string
  readonly items: readonly string[]
}

/** A structured extraction result (e.g. scenarios with named fields). */
export type StructuredExtraction = Readonly<Record<string, string | string[]>>

/**
 * Internal semantic value produced after upstream extraction and capture.
 *
 * `value` is the main string seen by transforms. When capture is present it is
 * the first capture group (`$1`); otherwise it is the extracted base text.
 */
interface CapturedValue {
  readonly value: string
  readonly fullMatch?: string
  readonly groups: readonly string[]
}

const EMPTY_TRANSFORM_CONTEXT: ExtractorTransformContext = new Map()

/**
 * Normalizes raw transform declarations accepted by older callers/tests.
 *
 * The YAML boundary now normalizes declarations, but runtime code still accepts
 * string shorthand to preserve compatibility with legacy in-memory objects.
 *
 * @param declaration - Raw runtime transform declaration
 * @returns Normalized declaration object, or `undefined`
 */
function normalizeTransformDeclaration(
  declaration: ExtractorTransformDeclaration | string | undefined,
): ExtractorTransformDeclaration | undefined {
  if (declaration === undefined) return undefined
  if (typeof declaration === 'string') {
    return { name: declaration }
  }
  return declaration
}

/**
 * Applies a `strip` regex to text, removing the matched portion.
 *
 * @param text - The text to process
 * @param stripPattern - Regex pattern to remove
 * @returns Text with the pattern removed
 */
function applyStrip(text: string, stripPattern: string): string {
  const re = safeRegex(stripPattern)
  if (re === null) return text
  return text.replace(re, '').trim()
}

/**
 * Extracts text from a single matched node according to the `extract` mode.
 *
 * @param node - The AST node to extract from
 * @param extract - The extraction mode
 * @param renderer - Serializer for rendering subtrees
 * @returns Extracted text
 */
function extractText(
  node: SelectorNode,
  extract: 'content' | 'label' | 'both' | undefined,
  renderer: SubtreeRenderer,
): string {
  const mode = extract ?? 'content'
  if (mode === 'label') return node.label ?? ''
  if (mode === 'both') return `${node.label ?? ''}\n${renderer.renderSubtree(node)}`
  if (node.children !== undefined && node.children.length > 0) {
    return node.children.map((child) => renderer.renderSubtree(child)).join('\n')
  }
  return renderer.renderSubtree(node)
}

/**
 * Returns the semantic captured values for one extracted text.
 *
 * When capture is absent, the emitted value is the stripped text itself.
 * When capture is present, one emitted value is produced per regex match and
 * the semantic value is the first capture group (`$1`).
 *
 * @param text - The extracted base text
 * @param capturePattern - Optional regex with capture groups
 * @returns Semantic captured values for downstream transforms
 */
function captureValues(text: string, capturePattern?: string): CapturedValue[] {
  const normalized = text.trim()
  if (normalized === '') return []
  if (capturePattern === undefined) {
    return [{ value: normalized, groups: [] }]
  }

  const re = safeRegex(capturePattern, 'g')
  if (re === null) return []

  const values: CapturedValue[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(normalized)) !== null) {
    const firstGroup = match[1]
    if (typeof firstGroup !== 'string') {
      continue
    }
    values.push({
      value: firstGroup,
      fullMatch: match[0],
      groups: match.slice(1),
    })
  }
  return values
}

/**
 * Returns the semantic follow-sibling value for a sibling regex pattern.
 *
 * If the pattern contains capture groups, the semantic value becomes the first
 * capture group (`$1`). Otherwise the raw stripped text is preserved.
 *
 * @param text - The follow-sibling text to interpret
 * @param followPattern - Regex used by `followSiblings`
 * @returns A single semantic captured value for the sibling
 */
function captureFollowSiblingValue(text: string, followPattern: string): CapturedValue[] {
  const normalized = text.trim()
  if (normalized === '') return []

  const re = safeRegex(followPattern)
  if (re === null) {
    return [{ value: normalized, groups: [] }]
  }

  const match = re.exec(normalized)
  if (match === null) {
    return [{ value: normalized, groups: [] }]
  }

  if (match.length > 1 && typeof match[1] === 'string') {
    return [
      {
        value: match[1],
        fullMatch: match[0],
        groups: match.slice(1),
      },
    ]
  }

  return [{ value: normalized, groups: [] }]
}

/**
 * Resolves a placeholder token against one captured value.
 *
 * Supported placeholders are `$0`, `$1`, `$2`, and so on. When the referenced
 * capture group is not available, `undefined` is returned.
 *
 * @param placeholder - Placeholder token without surrounding context
 * @param captured - The captured value context for this invocation
 * @returns The resolved placeholder string, or `undefined`
 */
function resolvePlaceholder(placeholder: string, captured: CapturedValue): string | undefined {
  if (!placeholder.startsWith('$')) return undefined

  const index = Number.parseInt(placeholder.slice(1), 10)
  if (Number.isNaN(index)) return undefined

  if (index === 0) {
    return captured.fullMatch
  }

  return captured.groups[index - 1]
}

/**
 * Interpolates declarative transform args for one captured value.
 *
 * Args that are not pure placeholders remain unchanged. Placeholder args that
 * reference missing groups resolve to `undefined`.
 *
 * @param declaration - The transform declaration
 * @param captured - Captured value backing this invocation
 * @returns Interpolated arg list for the transform callback
 */
function interpolateArgs(
  declaration: ExtractorTransformDeclaration,
  captured: CapturedValue,
): readonly (string | undefined)[] {
  return (declaration.args ?? []).map((arg) => {
    if (/^\$\d+$/.test(arg)) {
      return resolvePlaceholder(arg, captured)
    }
    return arg
  })
}

/**
 * Executes a named extractor transform for one captured value.
 *
 * @param declaration - Transform declaration from the extractor model
 * @param captured - Captured value to transform
 * @param transforms - Registered extractor transforms
 * @param context - Caller-owned transform context bag
 * @param owner - Whether this transform belongs to the extractor or a field
 * @param fieldName - Field name when `owner === 'field'`
 * @returns The transformed value
 * @throws {ExtractorTransformError} When lookup or execution fails
 */
async function executeTransform(
  declaration: ExtractorTransformDeclaration | string,
  captured: CapturedValue,
  transforms: ExtractorTransformRegistry | undefined,
  context: ExtractorTransformContext,
  owner: 'extractor' | 'field',
  fieldName?: string,
): Promise<string> {
  const normalized = normalizeTransformDeclaration(declaration)
  if (normalized === undefined) return captured.value

  const fn = transforms?.get(normalized.name)
  if (fn === undefined) {
    const options = fieldName !== undefined ? { fieldName } : undefined
    throw new ExtractorTransformError(
      normalized.name,
      owner,
      `extractor transform '${normalized.name}' is not registered`,
      options,
    )
  }

  try {
    return await executeRegisteredTransform(
      fn,
      captured,
      interpolateArgs(normalized, captured),
      context,
    )
  } catch (error) {
    const detail = error instanceof Error && error.message.length > 0 ? `: ${error.message}` : ''
    throw new ExtractorTransformError(
      normalized.name,
      owner,
      `extractor transform '${normalized.name}' failed${detail}`,
      {
        ...(fieldName !== undefined ? { fieldName } : {}),
        cause: error,
      },
    )
  }
}

/**
 * Resolves final string values from captured values and an optional transform.
 *
 * @param capturedValues - Semantic captured values from the upstream pipeline
 * @param declaration - Optional transform declaration to apply per value
 * @param transforms - Registered extractor transforms
 * @param context - Caller-owned transform context bag
 * @param owner - Whether this transform belongs to the extractor or a field
 * @param fieldName - Field name when `owner === 'field'`
 * @returns Final string values to include in the extraction result
 * @throws {ExtractorTransformError} When lookup or execution fails
 */
async function resolveCapturedValues(
  capturedValues: readonly CapturedValue[],
  declaration: ExtractorTransformDeclaration | string | undefined,
  transforms: ExtractorTransformRegistry | undefined,
  context: ExtractorTransformContext,
  owner: 'extractor' | 'field',
  fieldName?: string,
): Promise<string[]> {
  const results: string[] = []

  for (const captured of capturedValues) {
    if (declaration === undefined) {
      results.push(captured.value)
      continue
    }

    results.push(
      await executeTransform(declaration, captured, transforms, context, owner, fieldName),
    )
  }

  return results
}

/**
 * Executes a registered transform callback and enforces the string return contract.
 *
 * @param transform - Registered transform callback
 * @param captured - Captured value for this invocation
 * @param args - Interpolated declarative args
 * @param context - Caller-owned transform context bag
 * @returns Transformed string
 * @throws {TypeError} When the transform does not return a string
 */
async function executeRegisteredTransform(
  transform: ExtractorTransform,
  captured: CapturedValue,
  args: readonly (string | undefined)[],
  context: ExtractorTransformContext,
): Promise<string> {
  const result = await transform(captured.value, args, context)
  if (typeof result !== 'string') {
    throw new TypeError('extractor transforms must return a string')
  }
  return result
}

/**
 * Applies extractor-level text normalization before capture.
 *
 * @param text - Base extracted text
 * @param stripPattern - Optional strip regex
 * @returns Normalized extracted text
 */
function normalizeExtractedText(text: string, stripPattern?: string): string {
  if (stripPattern === undefined) {
    return text.trim()
  }
  return applyStrip(text, stripPattern)
}

/**
 * Generic extraction engine — runs a single extractor against an AST root.
 *
 * Pure function — no I/O. Handles single-value, array-value, grouped, and
 * structured extraction modes based on the extractor configuration.
 *
 * @param root - The AST root node to extract from
 * @param extractor - The extraction configuration
 * @param renderer - Serializer for rendering AST subtrees to text
 * @param transforms - Named transform callbacks (for example `resolveSpecPath`)
 * @param transformContext - Opaque caller-owned transform context bag
 * @returns Extracted values as strings, grouped objects, or structured objects
 * @throws {ExtractorTransformError} When transform lookup or execution fails
 */
export async function extractContent(
  root: SelectorNode,
  extractor: Extractor,
  renderer: SubtreeRenderer,
  transforms?: ExtractorTransformRegistry,
  transformContext: ExtractorTransformContext = EMPTY_TRANSFORM_CONTEXT,
): Promise<string[] | GroupedExtraction[] | StructuredExtraction[]> {
  const nodes = findNodes(root, extractor.selector)
  if (nodes.length === 0) return []

  if (extractor.fields !== undefined) {
    const matches = findNodesWithAncestors(root, extractor.selector)
    return await extractStructured(matches, extractor, renderer, transforms, transformContext)
  }

  if (extractor.groupBy === 'label') {
    return await extractGrouped(nodes, extractor, renderer, transforms, transformContext)
  }

  const results: string[] = []
  for (const node of nodes) {
    const text = normalizeExtractedText(
      extractText(node, extractor.extract, renderer),
      extractor.strip,
    )
    const captured = captureValues(text, extractor.capture)
    results.push(
      ...(await resolveCapturedValues(
        captured,
        extractor.transform,
        transforms,
        transformContext,
        'extractor',
      )),
    )
  }

  return results
}

/**
 * Extracts grouped results: nodes grouped by their label.
 * Each group produces a label and array of extracted item values.
 *
 * @param nodes - Matched AST nodes
 * @param extractor - The extraction configuration
 * @param renderer - Serializer for rendering subtrees
 * @param transforms - Named transform callbacks
 * @param transformContext - Opaque caller-owned transform context bag
 * @returns Grouped extraction results
 */
async function extractGrouped(
  nodes: readonly SelectorNode[],
  extractor: Extractor,
  renderer: SubtreeRenderer,
  transforms: ExtractorTransformRegistry | undefined,
  transformContext: ExtractorTransformContext,
): Promise<GroupedExtraction[]> {
  const groups = new Map<string, string[]>()

  for (const node of nodes) {
    let label = node.label ?? ''
    if (extractor.strip !== undefined) {
      label = applyStrip(label, extractor.strip)
    }

    const text = normalizeExtractedText(
      extractText(node, extractor.extract, renderer),
      extractor.strip,
    )
    const items = await resolveCapturedValues(
      captureValues(text, extractor.capture),
      extractor.transform,
      transforms,
      transformContext,
      'extractor',
    )

    if (!groups.has(label)) {
      groups.set(label, [])
    }
    groups.get(label)?.push(...items)
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }))
}

/**
 * Extracts structured objects: each matched node produces one object
 * with fields mapped according to the extractor's `fields` configuration.
 *
 * @param matches - Matched AST nodes with their ancestor chains
 * @param extractor - The extraction configuration with `fields`
 * @param renderer - Serializer for rendering subtrees
 * @param transforms - Named transform callbacks
 * @param transformContext - Opaque caller-owned transform context bag
 * @returns Structured extraction results
 */
async function extractStructured(
  matches: readonly NodeMatch[],
  extractor: Extractor,
  renderer: SubtreeRenderer,
  transforms: ExtractorTransformRegistry | undefined,
  transformContext: ExtractorTransformContext,
): Promise<StructuredExtraction[]> {
  const fields = extractor.fields!
  const results: StructuredExtraction[] = []
  const hasFollowSiblings = Object.values(fields).some(
    (mapping) => mapping.followSiblings !== undefined,
  )

  for (const { node, ancestors } of matches) {
    const obj: Record<string, string | string[]> = {}

    if (hasFollowSiblings) {
      await extractFieldsWithFollowSiblings(
        node,
        ancestors,
        fields,
        renderer,
        obj,
        transforms,
        transformContext,
      )
    } else {
      for (const [fieldName, mapping] of Object.entries(fields)) {
        const value = await extractField(
          node,
          ancestors,
          fieldName,
          mapping,
          renderer,
          findNodes,
          transforms,
          transformContext,
        )
        if (value !== undefined) {
          obj[fieldName] = value
        }
      }
    }

    if (Object.keys(obj).length > 0) {
      results.push(obj)
    }
  }

  return results
}

/**
 * Extracts fields using sequential sibling walk. Walks all children of the
 * matched node in order. For each child, checks if it matches any field's
 * `childSelector`. If so, that field becomes active and the child's values are
 * added to it. If the child does not match any field but matches the active
 * field's `followSiblings` pattern, it is appended to that field.
 *
 * @param node - The matched AST node whose children are walked
 * @param ancestors - Ancestor chain from root to the node's parent
 * @param fields - Field mapping declarations from the extractor
 * @param renderer - Serializer for rendering subtrees
 * @param obj - Mutable result object to populate with extracted fields
 * @param transforms - Named transform callbacks
 * @param transformContext - Opaque caller-owned transform context bag
 */
async function extractFieldsWithFollowSiblings(
  node: SelectorNode,
  ancestors: readonly SelectorNode[],
  fields: Readonly<Record<string, FieldMapping>>,
  renderer: SubtreeRenderer,
  obj: Record<string, string | string[]>,
  transforms: ExtractorTransformRegistry | undefined,
  transformContext: ExtractorTransformContext,
): Promise<void> {
  for (const [fieldName, mapping] of Object.entries(fields)) {
    if (mapping.childSelector !== undefined) continue
    const value = await extractField(
      node,
      ancestors,
      fieldName,
      mapping,
      renderer,
      findNodes,
      transforms,
      transformContext,
    )
    if (value !== undefined) {
      obj[fieldName] = value
    }
  }

  const childSelectorFields: Array<{
    readonly name: string
    readonly mapping: FieldMapping
    readonly selector: Selector
    readonly followPattern: RegExp | null
  }> = []

  for (const [fieldName, mapping] of Object.entries(fields)) {
    if (mapping.childSelector === undefined) continue
    childSelectorFields.push({
      name: fieldName,
      mapping,
      selector: mapping.childSelector,
      followPattern:
        mapping.followSiblings !== undefined ? safeRegex(mapping.followSiblings, 'i') : null,
    })
  }

  if (childSelectorFields.length === 0) return

  const allChildren = collectLeafChildren(node)
  let activeField: (typeof childSelectorFields)[number] | null = null

  for (const child of allChildren) {
    let matchedField = false
    for (const field of childSelectorFields) {
      if (!nodeMatches(child, field.selector)) continue

      activeField = field
      matchedField = true
      const values = await extractChildValues(
        child,
        field.name,
        field.mapping,
        renderer,
        transforms,
        transformContext,
      )
      if (values.length > 0) {
        if (!Array.isArray(obj[field.name])) {
          obj[field.name] = []
        }
        ;(obj[field.name] as string[]).push(...values)
      }
      break
    }

    if (matchedField || activeField === null || activeField.followPattern === null) {
      continue
    }

    const label = child.label ?? ''
    if (!activeField.followPattern.test(label)) {
      continue
    }

    const values = await extractFollowSiblingValues(
      child,
      activeField.name,
      activeField.mapping,
      renderer,
      transforms,
      transformContext,
    )
    if (values.length > 0) {
      if (!Array.isArray(obj[activeField.name])) {
        obj[activeField.name] = []
      }
      ;(obj[activeField.name] as string[]).push(...values)
    }
  }

  for (const field of childSelectorFields) {
    const value = obj[field.name]
    if (Array.isArray(value) && value.length === 0) {
      delete obj[field.name]
    }
  }
}

/**
 * Collects all leaf children from a node, flattening nested structures.
 *
 * @param node - The parent node to collect leaf children from
 * @returns Flat array of leaf child nodes
 */
function collectLeafChildren(node: SelectorNode): SelectorNode[] {
  if (node.children === undefined || node.children.length === 0) return []

  const result: SelectorNode[] = []
  for (const child of node.children) {
    if (child.type === 'list-item') {
      result.push(child)
      continue
    }

    if (child.children !== undefined && child.children.length > 0) {
      result.push(...collectLeafChildren(child))
    }
  }
  return result
}

/**
 * Extracts semantic values from one child-selector match.
 *
 * @param child - The matched child node
 * @param fieldName - Field being populated
 * @param mapping - Field mapping configuration
 * @param renderer - Serializer for rendering subtrees
 * @param transforms - Named transform callbacks
 * @param transformContext - Opaque caller-owned transform context bag
 * @returns Final field values derived from the child node
 */
async function extractChildValues(
  child: SelectorNode,
  fieldName: string,
  mapping: FieldMapping,
  renderer: SubtreeRenderer,
  transforms: ExtractorTransformRegistry | undefined,
  transformContext: ExtractorTransformContext,
): Promise<string[]> {
  const text = normalizeExtractedText(
    renderer.renderSubtree(child).trim() || (child.label ?? ''),
    mapping.strip,
  )
  return await resolveCapturedValues(
    captureValues(text, mapping.capture),
    mapping.transform,
    transforms,
    transformContext,
    'field',
    fieldName,
  )
}

/**
 * Extracts semantic values from one follow-sibling match.
 *
 * @param child - The follow-sibling node
 * @param fieldName - Field being populated
 * @param mapping - Field mapping configuration
 * @param renderer - Serializer for rendering subtrees
 * @param transforms - Named transform callbacks
 * @param transformContext - Opaque caller-owned transform context bag
 * @returns Final field values derived from the sibling node
 */
async function extractFollowSiblingValues(
  child: SelectorNode,
  fieldName: string,
  mapping: FieldMapping,
  renderer: SubtreeRenderer,
  transforms: ExtractorTransformRegistry | undefined,
  transformContext: ExtractorTransformContext,
): Promise<string[]> {
  const baseText = normalizeExtractedText(
    renderer.renderSubtree(child).trim() || (child.label ?? ''),
    mapping.strip,
  )
  const followPattern = mapping.followSiblings
  if (followPattern === undefined) return []

  return await resolveCapturedValues(
    captureFollowSiblingValue(baseText, followPattern),
    mapping.transform,
    transforms,
    transformContext,
    'field',
    fieldName,
  )
}

/**
 * Extracts a single field value from a node according to its mapping.
 *
 * @param node - The AST node to extract from
 * @param ancestors - Ancestor chain from root to the node's parent
 * @param fieldName - Name of the field being extracted
 * @param mapping - The field mapping configuration
 * @param renderer - Serializer for rendering subtrees
 * @param nodeFinder - Function used to resolve child selectors
 * @param transforms - Named transform callbacks
 * @param transformContext - Opaque caller-owned transform context bag
 * @returns The extracted field value, or `undefined`
 */
async function extractField(
  node: SelectorNode,
  ancestors: readonly SelectorNode[],
  fieldName: string,
  mapping: FieldMapping,
  renderer: SubtreeRenderer,
  nodeFinder: (root: SelectorNode, selector: Selector) => SelectorNode[],
  transforms: ExtractorTransformRegistry | undefined,
  transformContext: ExtractorTransformContext,
): Promise<string | string[] | undefined> {
  if (mapping.childSelector !== undefined) {
    const children = nodeFinder(node, mapping.childSelector)
    if (children.length === 0) return undefined

    const results: string[] = []
    for (const child of children) {
      results.push(
        ...(await extractChildValues(
          child,
          fieldName,
          mapping,
          renderer,
          transforms,
          transformContext,
        )),
      )
    }
    return results.length > 0 ? results : undefined
  }

  const from = mapping.from ?? 'content'
  let text: string

  if (from === 'label') {
    text = node.label ?? ''
  } else if (from === 'parentLabel') {
    const parent = [...ancestors].reverse().find((ancestor) => ancestor.label !== undefined)
    text = parent?.label ?? ''
  } else {
    text = renderer.renderSubtree(node).trim()
  }

  const values = await resolveCapturedValues(
    captureValues(normalizeExtractedText(text, mapping.strip), mapping.capture),
    mapping.transform,
    transforms,
    transformContext,
    'field',
    fieldName,
  )

  return values[0]
}

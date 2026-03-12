import { type Extractor, type FieldMapping } from '../value-objects/extractor.js'
import { type Selector } from '../value-objects/selector.js'
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

/** A grouped extraction result (e.g. rules grouped by requirement label). */
export interface GroupedExtraction {
  readonly label: string
  readonly items: readonly string[]
}

/** A structured extraction result (e.g. scenarios with named fields). */
export type StructuredExtraction = Readonly<Record<string, string | string[]>>

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
 * Applies a `capture` regex to text, returning the first capture group match.
 * If no capture group matches, returns null.
 *
 * @param text - The text to capture from
 * @param capturePattern - Regex with capture group
 * @returns The first capture group match, or null
 */
function applyCapture(text: string, capturePattern: string): string | null {
  const re = safeRegex(capturePattern)
  if (re === null) return text
  const match = re.exec(text)
  return match?.[1] ?? null
}

/**
 * Applies a `capture` regex globally to text, returning all capture group matches.
 *
 * @param text - The text to capture from
 * @param capturePattern - Regex with capture group
 * @returns All capture group matches
 */
function applyCaptureAll(text: string, capturePattern: string): string[] {
  const re = safeRegex(capturePattern, 'g')
  if (re === null) return []
  const results: string[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match[1] !== undefined) results.push(match[1])
  }
  return results
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
  // Content mode: render children only (skip the node's own heading/label)
  if (node.children && node.children.length > 0) {
    return node.children.map((c) => renderer.renderSubtree(c)).join('')
  }
  return renderer.renderSubtree(node)
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
 * @param transforms - Named transform callbacks (e.g. `resolveSpecPath`)
 * @returns Extracted values as strings, grouped objects, or structured objects
 */
export function extractContent(
  root: SelectorNode,
  extractor: Extractor,
  renderer: SubtreeRenderer,
  transforms?: ReadonlyMap<string, (values: string[]) => string[]>,
): string[] | GroupedExtraction[] | StructuredExtraction[] {
  const nodes = findNodes(root, extractor.selector)
  if (nodes.length === 0) return []

  // Structured extraction with fields — needs ancestor tracking for parentLabel
  if (extractor.fields !== undefined) {
    const matches = findNodesWithAncestors(root, extractor.selector)
    return extractStructured(matches, extractor, renderer)
  }

  // Grouped extraction
  if (extractor.groupBy === 'label') {
    return extractGrouped(nodes, extractor, renderer)
  }

  // Simple extraction (single or array)
  let results: string[] = []
  for (const node of nodes) {
    let text = extractText(node, extractor.extract, renderer)

    if (extractor.strip !== undefined) {
      text = applyStrip(text, extractor.strip)
    }

    if (extractor.capture !== undefined) {
      const allCaptures = applyCaptureAll(text, extractor.capture)
      if (allCaptures.length > 0) {
        results.push(...allCaptures)
      }
    } else {
      if (text.trim()) results.push(text.trim())
    }
  }

  // Apply named transform
  if (extractor.transform !== undefined && transforms !== undefined) {
    const fn = transforms.get(extractor.transform)
    if (fn !== undefined) {
      results = fn(results)
    }
  }

  return results
}

/**
 * Extracts grouped results: nodes grouped by their label.
 * Each group produces a label and array of child content items.
 *
 * @param nodes - Matched AST nodes
 * @param extractor - The extraction configuration
 * @param renderer - Serializer for rendering subtrees
 * @returns Grouped extraction results
 */
function extractGrouped(
  nodes: SelectorNode[],
  extractor: Extractor,
  renderer: SubtreeRenderer,
): GroupedExtraction[] {
  const groups = new Map<string, string[]>()

  for (const node of nodes) {
    let label = node.label ?? ''
    if (extractor.strip !== undefined) {
      label = applyStrip(label, extractor.strip)
    }

    if (!groups.has(label)) {
      groups.set(label, [])
    }

    const items = groups.get(label)!
    // Render entire section body as a single content block
    const text = extractText(node, extractor.extract, renderer).trim()
    if (text) items.push(text)
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
 * @returns Structured extraction results
 */
function extractStructured(
  matches: NodeMatch[],
  extractor: Extractor,
  renderer: SubtreeRenderer,
): StructuredExtraction[] {
  const fields = extractor.fields!
  const results: StructuredExtraction[] = []

  // Check if any field uses followSiblings — triggers sequential walk mode
  const hasFollowSiblings = Object.values(fields).some((m) => m.followSiblings !== undefined)

  for (const { node, ancestors } of matches) {
    const obj: Record<string, string | string[]> = {}

    if (hasFollowSiblings) {
      // Sequential walk: process children in order, tracking which field is active.
      // When a child matches a field's childSelector, that field becomes active.
      // Subsequent siblings matching the active field's followSiblings are appended to it.
      extractFieldsWithFollowSiblings(node, ancestors, fields, renderer, obj)
    } else {
      for (const [fieldName, mapping] of Object.entries(fields)) {
        const value = extractField(node, ancestors, mapping, renderer, findNodes)
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
 * `childSelector`. If so, that field becomes active and the child's text is
 * added to it. If the child doesn't match any field but matches the active
 * field's `followSiblings` pattern, it is appended to the active field.
 *
 * Fields without `childSelector` (e.g. `from: label`) are extracted normally.
 *
 * @param node - The matched AST node whose children are walked
 * @param ancestors - Ancestor chain from root to the node's parent
 * @param fields - Field mapping declarations from the extractor
 * @param renderer - Serializer for rendering subtrees
 * @param obj - Mutable result object to populate with extracted fields
 */
function extractFieldsWithFollowSiblings(
  node: SelectorNode,
  ancestors: readonly SelectorNode[],
  fields: Readonly<Record<string, FieldMapping>>,
  renderer: SubtreeRenderer,
  obj: Record<string, string | string[]>,
): void {
  // First, extract non-childSelector fields normally
  for (const [fieldName, mapping] of Object.entries(fields)) {
    if (mapping.childSelector !== undefined) continue
    const value = extractField(node, ancestors, mapping, renderer, findNodes)
    if (value !== undefined) {
      obj[fieldName] = value
    }
  }

  // Collect childSelector fields for sequential matching
  const childSelectorFields: Array<{
    name: string
    mapping: FieldMapping
    selector: Selector
    followPattern: RegExp | null
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

  // Collect all leaf children (list-items etc.) via flat walk
  const allChildren = collectLeafChildren(node)

  let activeField: (typeof childSelectorFields)[number] | null = null

  for (const child of allChildren) {
    // Check if this child matches any field's childSelector
    let matched = false
    for (const field of childSelectorFields) {
      if (nodeMatches(child, field.selector)) {
        activeField = field
        matched = true
        const text = extractChildText(child, field.mapping, renderer)
        if (text) {
          if (obj[field.name] === undefined) obj[field.name] = []
          ;(obj[field.name] as string[]).push(text)
        }
        break
      }
    }

    // If no field matched, check if it matches the active field's followSiblings
    if (!matched && activeField !== null && activeField.followPattern !== null) {
      const label = child.label ?? ''
      if (activeField.followPattern.test(label)) {
        // For follow siblings, apply capture group if present; otherwise use raw text
        const text = extractFollowSiblingText(child, activeField.mapping.followSiblings!, renderer)
        if (text) {
          if (obj[activeField.name] === undefined) obj[activeField.name] = []
          ;(obj[activeField.name] as string[]).push(text)
        }
      }
    }
  }

  // Remove empty arrays
  for (const field of childSelectorFields) {
    const val = obj[field.name]
    if (Array.isArray(val) && val.length === 0) {
      delete obj[field.name]
    }
  }
}

/**
 * Collects all leaf children from a node, flattening nested structures.
 * For section nodes with sub-sections, recurses into children.
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
    } else if (child.children !== undefined && child.children.length > 0) {
      result.push(...collectLeafChildren(child))
    }
  }
  return result
}

/**
 * Extracts text from a single child node, applying capture if configured.
 *
 * @param child - The child AST node
 * @param mapping - The field mapping with optional capture pattern
 * @param renderer - Serializer for rendering subtrees
 * @returns The extracted text
 */
function extractChildText(
  child: SelectorNode,
  mapping: FieldMapping,
  renderer: SubtreeRenderer,
): string {
  let text = renderer.renderSubtree(child).trim() || (child.label ?? '')
  if (mapping.capture !== undefined) {
    const captured = applyCapture(text, mapping.capture)
    if (captured !== null) text = captured
  }
  return text
}

/**
 * Extracts text from a follow-sibling node.
 * If the `followSiblings` pattern contains a capture group, applies it.
 * Otherwise returns the raw text without transformation.
 *
 * @param child - The follow-sibling AST node
 * @param followPattern - The followSiblings regex pattern
 * @param renderer - Serializer for rendering subtrees
 * @returns The extracted text
 */
function extractFollowSiblingText(
  child: SelectorNode,
  followPattern: string,
  renderer: SubtreeRenderer,
): string {
  const text = renderer.renderSubtree(child).trim() || (child.label ?? '')
  // If the pattern has a capture group, use it
  const captured = applyCapture(text, followPattern)
  if (captured !== null) return captured
  return text
}

/**
 * Extracts a single field value from a node according to its mapping.
 *
 * @param node - The AST node to extract from
 * @param ancestors - Ancestor chain from root to the node's parent
 * @param mapping - The field mapping configuration
 * @param renderer - Serializer for rendering subtrees
 * @param nodeFinder - Function to find child nodes matching a selector
 * @returns The extracted field value, or undefined
 */
function extractField(
  node: SelectorNode,
  ancestors: readonly SelectorNode[],
  mapping: FieldMapping,
  renderer: SubtreeRenderer,
  nodeFinder: (
    root: SelectorNode,
    selector: import('../value-objects/selector.js').Selector,
  ) => SelectorNode[],
): string | string[] | undefined {
  // childSelector mode — find children matching selector, apply capture
  if (mapping.childSelector !== undefined) {
    const children = nodeFinder(node, mapping.childSelector)
    if (children.length === 0) return undefined

    const results: string[] = []
    for (const child of children) {
      // Prefer rendered text; fall back to label for leaf nodes (e.g. list-items)
      // whose renderer may not handle them in isolation.
      let text = renderer.renderSubtree(child).trim() || (child.label ?? '')
      if (mapping.capture !== undefined) {
        const captured = applyCapture(text, mapping.capture)
        if (captured !== null) text = captured
      }
      if (text) results.push(text)
    }
    return results.length > 0 ? results : undefined
  }

  // from mode — extract value from the node itself
  const from = mapping.from ?? 'content'
  let text: string

  if (from === 'label') {
    text = node.label ?? ''
  } else if (from === 'parentLabel') {
    // Walk ancestors in reverse to find the nearest one with a label
    const parent = [...ancestors].reverse().find((a) => a.label !== undefined)
    text = parent?.label ?? ''
  } else {
    text = renderer.renderSubtree(node).trim()
  }

  if (mapping.strip !== undefined) {
    text = applyStrip(text, mapping.strip)
  }

  if (mapping.capture !== undefined) {
    const captured = applyCapture(text, mapping.capture)
    if (captured !== null) text = captured
  }

  return text.trim() || undefined
}

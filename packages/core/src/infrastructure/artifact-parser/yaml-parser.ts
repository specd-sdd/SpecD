import { parse as parseYaml, parseDocument, stringify, YAMLMap, YAMLSeq, Scalar } from 'yaml'
import type { Document } from 'yaml'
import { z } from 'zod'
import {
  type ArtifactAST,
  type ArtifactNode,
  type ArtifactParser,
  type DeltaEntry,
  type NodeTypeDescriptor,
  type OutlineEntry,
} from '../../application/ports/artifact-parser.js'
import { SchemaValidationError } from '../../domain/errors/schema-validation-error.js'
import { applyDelta } from './_shared/apply-delta.js'

const selectorSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    type: z.string(),
    matches: z.string().optional(),
    contains: z.string().optional(),
    parent: selectorSchema.optional(),
    index: z.number().optional(),
    where: z.record(z.string()).optional(),
  }),
)

const deltaPositionSchema = z.object({
  parent: selectorSchema.optional(),
  after: selectorSchema.optional(),
  before: selectorSchema.optional(),
  first: z.boolean().optional(),
  last: z.boolean().optional(),
})

const deltaEntrySchema = z.object({
  op: z.enum(['added', 'modified', 'removed']),
  selector: selectorSchema.optional(),
  position: deltaPositionSchema.optional(),
  rename: z.string().optional(),
  content: z.string().optional(),
  value: z.unknown().optional(),
  strategy: z.enum(['replace', 'append', 'merge-by']).optional(),
  mergeKey: z.string().optional(),
})

const deltaArraySchema = z.array(deltaEntrySchema)

/** A YAML-compatible scalar value type. */
type ScalarValue = string | number | boolean | null

/**
 * Converts a `yaml` library `Scalar` node to a `ScalarValue`.
 *
 * @param s - The `Scalar` node to convert
 * @returns The scalar value, or a JSON-stringified fallback for unsupported types
 */
function scalarToValue(s: Scalar): ScalarValue {
  const v = s.value
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v
  }
  return JSON.stringify(v)
}

/**
 * Converts a `yaml` library parsed node (`YAMLMap`, `YAMLSeq`, or `Scalar`) to a
 * normalized `ArtifactNode`. Returns `null` for top-level scalars (handled by the caller).
 *
 * @param node - The `yaml` library node to convert
 * @returns The normalized `ArtifactNode`, or `null` if the node type cannot be represented
 */
function yamlNodeToArtifact(node: unknown): ArtifactNode | null {
  if (node === null || node === undefined) return null

  if (node instanceof YAMLMap) {
    const pairs: ArtifactNode[] = []
    for (const rawPair of node.items) {
      const p = rawPair
      const key = p.key instanceof Scalar ? String(p.key.value) : String(p.key)
      const val: unknown = p.value

      if (val === null || val === undefined) {
        pairs.push({ type: 'pair', label: key, value: null })
      } else if (val instanceof Scalar) {
        pairs.push({ type: 'pair', label: key, value: scalarToValue(val) })
      } else {
        const child = yamlNodeToArtifact(val)
        if (child) {
          pairs.push({ type: 'pair', label: key, children: [child] })
        } else {
          pairs.push({ type: 'pair', label: key, value: null })
        }
      }
    }
    return { type: 'mapping', children: pairs }
  }

  if (node instanceof YAMLSeq) {
    const items: ArtifactNode[] = []
    for (const item of node.items) {
      if (item instanceof Scalar) {
        items.push({ type: 'sequence-item', value: scalarToValue(item as Scalar) })
      } else if (item !== null && item !== undefined) {
        const child = yamlNodeToArtifact(item)
        if (child) {
          items.push({ type: 'sequence-item', children: [child] })
        } else {
          items.push({ type: 'sequence-item', value: null })
        }
      }
    }
    return { type: 'sequence', children: items }
  }

  if (node instanceof Scalar) {
    // Top-level scalar — return null; handled by parent
    return null
  }

  return null
}

/**
 * Converts a parsed `yaml` `Document` to a normalized `ArtifactAST`.
 *
 * @param doc - The parsed YAML document
 * @param originalContent - The original YAML string, stored on the root node as `_yaml` for round-trip fidelity
 * @returns The normalized AST with a `document` root node
 */
function documentToArtifactAST(doc: Document, originalContent: string): ArtifactAST {
  const docNode = doc.contents

  if (docNode === null || docNode === undefined) {
    return { root: { type: 'document', children: [], _yaml: originalContent } }
  }

  if (docNode instanceof YAMLMap) {
    const pairs: ArtifactNode[] = []
    for (const rawPair of docNode.items) {
      const p = rawPair
      const key = p.key instanceof Scalar ? String(p.key.value) : String(p.key)
      const val: unknown = p.value

      if (val === null || val === undefined) {
        pairs.push({ type: 'pair', label: key, value: null })
      } else if (val instanceof Scalar) {
        pairs.push({ type: 'pair', label: key, value: scalarToValue(val) })
      } else {
        const child = yamlNodeToArtifact(val)
        if (child) {
          pairs.push({ type: 'pair', label: key, children: [child] })
        } else {
          pairs.push({ type: 'pair', label: key, value: null })
        }
      }
    }
    return { root: { type: 'document', children: pairs, _yaml: originalContent } }
  }

  if (docNode instanceof YAMLSeq) {
    const seq = yamlNodeToArtifact(docNode)
    return { root: { type: 'document', children: seq ? [seq] : [], _yaml: originalContent } }
  }

  return { root: { type: 'document', children: [], _yaml: originalContent } }
}

/**
 * Converts a normalized `ArtifactNode` back into a plain JavaScript value suitable for YAML serialization.
 *
 * @param node - The AST node to convert
 * @returns The JavaScript value represented by the node
 */
function artifactNodeToJsValue(node: ArtifactNode): unknown {
  if (node.type === 'document') {
    const children = node.children ?? []
    if (children.every((c) => c.type === 'pair')) {
      const obj: Record<string, unknown> = {}
      for (const pair of children) {
        obj[pair.label ?? ''] = artifactPairToJsValue(pair)
      }
      return obj
    }
    if (children.length === 1 && children[0]!.type === 'sequence') {
      return artifactNodeToJsValue(children[0]!)
    }
    return {}
  }
  if (node.type === 'mapping') {
    const obj: Record<string, unknown> = {}
    for (const pair of node.children ?? []) {
      obj[pair.label ?? ''] = artifactPairToJsValue(pair)
    }
    return obj
  }
  if (node.type === 'sequence') {
    return (node.children ?? []).map((item) => artifactSequenceItemToJsValue(item))
  }
  if (node.type === 'pair') {
    return artifactPairToJsValue(node)
  }
  if (node.type === 'sequence-item') {
    return artifactSequenceItemToJsValue(node)
  }
  return node.value ?? null
}

/**
 * Converts a normalized `pair` AST node to its JavaScript value.
 *
 * @param pair - The `pair` node to convert
 * @returns The JavaScript value of the pair's child or scalar value
 */
function artifactPairToJsValue(pair: ArtifactNode): unknown {
  if (pair.children && pair.children.length > 0) {
    return artifactNodeToJsValue(pair.children[0]!)
  }
  return pair.value ?? null
}

/**
 * Converts a normalized `sequence-item` AST node to its JavaScript value.
 *
 * @param item - The `sequence-item` node to convert
 * @returns The JavaScript value of the item's child or scalar value
 */
function artifactSequenceItemToJsValue(item: ArtifactNode): unknown {
  if (item.children && item.children.length > 0) {
    return artifactNodeToJsValue(item.children[0]!)
  }
  return item.value ?? null
}

/**
 * Converts a plain JavaScript value into a normalized YAML mapping or sequence `ArtifactNode`.
 *
 * @param value - The JavaScript value to convert (object, array, or scalar)
 * @returns A `mapping`, `sequence`, or scalar-typed `ArtifactNode`
 */
function jsValueToMapping(value: unknown): ArtifactNode {
  if (typeof value !== 'object' || value === null) {
    return { type: 'mapping', children: [] }
  }
  if (Array.isArray(value)) {
    const items: ArtifactNode[] = (value as unknown[]).map((item) => {
      if (item === null || typeof item !== 'object') {
        return { type: 'sequence-item', value: item as ScalarValue }
      }
      return { type: 'sequence-item', children: [jsValueToMapping(item)] }
    })
    return { type: 'sequence', children: items }
  }
  const obj = value as Record<string, unknown>
  const pairs: ArtifactNode[] = Object.entries(obj).map(([k, v]) => {
    if (v === null || typeof v !== 'object') {
      return { type: 'pair', label: k, value: v as ScalarValue }
    }
    return { type: 'pair', label: k, children: [jsValueToMapping(v)] }
  })
  return { type: 'mapping', children: pairs }
}

/**
 * Converts a raw delta `value` field into the appropriate `ArtifactNode` for YAML format,
 * respecting the target node type and parent type from the delta context.
 *
 * @param value - The raw value from the delta entry
 * @param ctx - Context describing the target node type and its parent type
 * @param ctx.nodeType - The type of the node being replaced or created
 * @param ctx.parentType - The type of the parent node
 * @returns The corresponding `ArtifactNode`
 */
function yamlValueToNode(
  value: unknown,
  ctx: { nodeType: string; parentType: string },
): ArtifactNode {
  if (value === null || typeof value !== 'object') {
    const scalar = value as ScalarValue
    if (ctx.nodeType === 'sequence-item' || ctx.parentType === 'sequence') {
      return { type: 'sequence-item', value: scalar }
    }
    return { type: ctx.nodeType === 'unknown' ? 'scalar' : ctx.nodeType, value: scalar }
  }
  if (Array.isArray(value)) {
    const items: ArtifactNode[] = (value as unknown[]).map((item) => {
      if (item === null || typeof item !== 'object') {
        return { type: 'sequence-item', value: item as ScalarValue }
      }
      const mapping = jsValueToMapping(item)
      return { type: 'sequence-item', children: [mapping] }
    })
    return { type: 'sequence', children: items }
  }
  return jsValueToMapping(value)
}

/** {@link ArtifactParser} implementation for YAML files. */
export class YamlParser implements ArtifactParser {
  /** File extensions this adapter handles. */
  get fileExtensions(): readonly string[] {
    return ['.yaml', '.yml']
  }

  /**
   * Parses YAML content into a normalized `ArtifactAST`.
   *
   * @param content - The YAML content to parse
   * @returns The normalized AST with a `document` root node
   */
  parse(content: string): ArtifactAST {
    const doc = parseDocument(content)
    return documentToArtifactAST(doc, content)
  }

  /**
   * Applies delta entries to the YAML AST using the YAML-specific value converter.
   *
   * @param ast - The base AST to apply the delta to
   * @param delta - The ordered list of delta entries
   * @returns A new AST with all delta operations applied
   */
  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST {
    return applyDelta(ast, delta, (c) => this.parse(c), yamlValueToNode)
  }

  /**
   * Serializes a YAML AST back to a YAML string, preserving the original content when unchanged.
   *
   * @param ast - The AST to serialize
   * @returns The YAML string representation
   */
  serialize(ast: ArtifactAST): string {
    const yamlStr = (ast.root as Record<string, unknown>)['_yaml']
    if (typeof yamlStr === 'string') {
      return yamlStr
    }
    const jsValue = artifactNodeToJsValue(ast.root)
    return stringify(jsValue)
  }

  /**
   * Serializes a single AST node and its descendants to a YAML string.
   *
   * @param node - The AST node to serialize
   * @returns The YAML string representation of the node
   */
  renderSubtree(node: ArtifactNode): string {
    const jsValue = artifactNodeToJsValue(node)
    return stringify(jsValue)
  }

  /**
   * Returns the static node type descriptors for YAML format.
   *
   * @returns An array of node type descriptors describing addressable YAML node types
   */
  nodeTypes(): readonly NodeTypeDescriptor[] {
    return [
      {
        type: 'document',
        identifiedBy: [],
        description: 'Root node of a YAML document.',
      },
      {
        type: 'mapping',
        identifiedBy: [],
        description: 'A YAML mapping (object) containing pair children.',
      },
      {
        type: 'pair',
        identifiedBy: ['matches'],
        description: 'A key–value entry in a YAML mapping. `matches` targets the key name.',
      },
      {
        type: 'sequence',
        identifiedBy: [],
        description: 'A YAML sequence (array) containing sequence-item children.',
      },
      {
        type: 'sequence-item',
        identifiedBy: ['index', 'where'],
        description:
          'An item in a YAML sequence. Use `index` for position or `where` for object items.',
      },
    ]
  }

  /**
   * Returns a simplified navigable outline of the YAML artifact's key hierarchy.
   *
   * @param ast - The AST to generate an outline for
   * @returns A nested list of pair outline entries
   */
  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const entries: OutlineEntry[] = []
    this.collectOutlineEntries(ast.root, 0, entries)
    return entries
  }

  /**
   * Recursively collects `pair` and `mapping` nodes into the outline entries list.
   *
   * @param node - The current AST node being processed
   * @param depth - The nesting depth (0 = root children)
   * @param entries - Accumulator for outline entries
   */
  private collectOutlineEntries(node: ArtifactNode, depth: number, entries: OutlineEntry[]): void {
    if (node.type === 'document') {
      for (const child of node.children ?? []) {
        this.collectOutlineEntries(child, depth, entries)
      }
    } else if (node.type === 'pair') {
      const children: OutlineEntry[] = []
      if (node.children && node.children.length > 0) {
        this.collectOutlineEntries(node.children[0]!, depth + 1, children)
      }
      entries.push({
        type: 'pair',
        label: node.label ?? '',
        depth,
        ...(children.length > 0 ? { children } : {}),
      })
    } else if (node.type === 'mapping') {
      for (const pair of node.children ?? []) {
        this.collectOutlineEntries(pair, depth, entries)
      }
    }
  }

  /**
   * Returns format-specific delta authoring instructions for injection into AI context.
   *
   * @returns A Markdown string describing YAML delta format and examples
   */
  deltaInstructions(): string {
    return `## YAML Delta Instructions

YAML files are parsed into a normalized AST with \`mapping\`, \`pair\`, \`sequence\`, and \`sequence-item\` nodes.

### Node Types
- \`pair\`: A key–value entry. Identified by \`matches\` (regex matched against key name).
- \`sequence-item\`: An item in a sequence. Identified by \`index\` (zero-based) or \`where\` (for mapping items).
- \`mapping\`: A YAML mapping. Contains \`pair\` children.
- \`sequence\`: A YAML sequence. Contains \`sequence-item\` children.

### Selector Fields
- \`type\`: One of \`pair\`, \`sequence-item\`, \`mapping\`, \`sequence\`.
- \`matches\`: Regex matched against key name (for \`pair\`).
- \`parent\`: Constrains search to descendants of a matched parent node.
- \`index\`: Zero-based index for \`sequence-item\`.
- \`where\`: Key-value match for mapping sequence items.

### Delta Examples
\`\`\`yaml
# Modify a scalar pair value
- op: modified
  selector:
    type: pair
    matches: model
    parent:
      type: pair
      matches: llm
  value: 'claude-opus-4-6'

# Modify a sequence item by key match
- op: modified
  selector:
    type: sequence-item
    parent:
      type: pair
      matches: steps
    where:
      name: 'Run tests'
  value:
    name: 'Run tests'
    run: 'pnpm test --coverage'

# Add a new pair
- op: added
  position:
    parent:
      type: document
  value:
    newKey: newValue
\`\`\``
  }

  /**
   * Parses a YAML delta file into a typed array of `DeltaEntry` objects.
   *
   * @param content - The YAML content of the delta file
   * @returns The parsed delta entries, or an empty array if the content is not a sequence
   * @throws {SchemaValidationError} If the parsed YAML does not conform to the `DeltaEntry` schema
   */
  parseDelta(content: string): readonly DeltaEntry[] {
    const parsed = parseYaml(content) as unknown
    if (!Array.isArray(parsed)) return []
    const result = deltaArraySchema.safeParse(parsed)
    if (!result.success) {
      throw new SchemaValidationError(
        'delta',
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      )
    }
    return result.data as DeltaEntry[]
  }
}

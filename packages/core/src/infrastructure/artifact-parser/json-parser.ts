import {
  type ArtifactAST,
  type ArtifactNode,
  type ArtifactParser,
  type DeltaEntry,
  type NodeTypeDescriptor,
  type OutlineEntry,
} from '../../application/ports/artifact-parser.js'
import { applyDelta } from './_shared/apply-delta.js'

/** A JSON-compatible scalar value type. */
type ScalarValue = string | number | boolean | null

/**
 * Converts an unknown JavaScript value to a JSON-safe `ScalarValue`.
 * Non-primitive values are stringified with `JSON.stringify`.
 *
 * @param v - The value to convert
 * @returns The scalar representation of the value
 */
function jsScalarToValue(v: unknown): ScalarValue {
  if (v === null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return JSON.stringify(v)
}

/**
 * Converts an arbitrary JavaScript value into a normalized `ArtifactNode` tree.
 *
 * @param value - The JavaScript value to convert (object, array, or primitive)
 * @returns The corresponding `ArtifactNode` representation
 */
function jsValueToNode(value: unknown): ArtifactNode {
  if (value === null || typeof value !== 'object') {
    return { type: 'scalar', value: jsScalarToValue(value) }
  }
  if (Array.isArray(value)) {
    const items: ArtifactNode[] = value.map((item) => {
      if (item === null || typeof item !== 'object') {
        return { type: 'array-item', value: jsScalarToValue(item) }
      }
      return { type: 'array-item', children: [jsValueToNode(item)] }
    })
    return { type: 'array', children: items }
  }
  const obj = value as Record<string, unknown>
  const properties: ArtifactNode[] = Object.entries(obj).map(([k, v]) => {
    if (v === null || typeof v !== 'object') {
      return { type: 'property', label: k, value: jsScalarToValue(v) }
    }
    return { type: 'property', label: k, children: [jsValueToNode(v)] }
  })
  return { type: 'object', children: properties }
}

/**
 * Converts a normalized `ArtifactNode` back into a plain JavaScript value.
 *
 * @param node - The AST node to convert
 * @returns The JavaScript value represented by the node
 */
function nodeToJsValue(node: ArtifactNode): unknown {
  if (node.type === 'document') {
    const child = node.children?.[0]
    if (!child) return null
    return nodeToJsValue(child)
  }
  if (node.type === 'object') {
    const obj: Record<string, unknown> = {}
    for (const prop of node.children ?? []) {
      obj[prop.label ?? ''] = nodeToJsValue(prop)
    }
    return obj
  }
  if (node.type === 'property') {
    if (node.children && node.children.length > 0) {
      return nodeToJsValue(node.children[0]!)
    }
    return node.value ?? null
  }
  if (node.type === 'array') {
    return (node.children ?? []).map((item) => nodeToJsValue(item))
  }
  if (node.type === 'array-item') {
    if (node.children && node.children.length > 0) {
      return nodeToJsValue(node.children[0]!)
    }
    return node.value ?? null
  }
  return node.value ?? null
}

/**
 * Converts a raw delta `value` field into the appropriate `ArtifactNode` for JSON format,
 * respecting the target node type and parent type from the delta context.
 *
 * @param value - The raw value from the delta entry
 * @param ctx - Context describing the target node type and its parent type
 * @param ctx.nodeType - The type of the node being replaced or created
 * @param ctx.parentType - The type of the parent node
 * @returns The corresponding `ArtifactNode`
 */
function jsonValueToNode(
  value: unknown,
  ctx: { nodeType: string; parentType: string },
): ArtifactNode {
  if (value === null || typeof value !== 'object') {
    const scalar = jsScalarToValue(value)
    if (ctx.parentType === 'array' || ctx.nodeType === 'array-item') {
      return { type: 'array-item', value: scalar }
    }
    return { type: ctx.nodeType === 'unknown' ? 'scalar' : ctx.nodeType, value: scalar }
  }
  if (Array.isArray(value)) {
    const items: ArtifactNode[] = value.map((item) => {
      if (item === null || typeof item !== 'object') {
        return { type: 'array-item', value: jsScalarToValue(item) }
      }
      return { type: 'array-item', children: [jsValueToNode(item)] }
    })
    return { type: 'array', children: items }
  }
  return jsValueToNode(value)
}

/** {@link ArtifactParser} implementation for JSON files. */
export class JsonParser implements ArtifactParser {
  /** File extensions this adapter handles. */
  get fileExtensions(): readonly string[] {
    return ['.json']
  }

  /**
   * Parses a JSON string into a normalized `ArtifactAST`.
   *
   * @param content - The JSON content to parse
   * @returns The normalized AST with a `document` root node
   */
  parse(content: string): ArtifactAST {
    const jsValue = JSON.parse(content) as unknown
    const rootNode = jsValueToNode(jsValue)
    return { root: { type: 'document', children: [rootNode] } }
  }

  /**
   * Applies delta entries to the AST using the JSON-specific value converter.
   *
   * @param ast - The base AST to apply the delta to
   * @param delta - The ordered list of delta entries
   * @returns A new AST with all delta operations applied
   */
  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST {
    return applyDelta(ast, delta, (c) => this.parse(c), jsonValueToNode)
  }

  /**
   * Serializes a JSON AST back to a pretty-printed JSON string.
   *
   * @param ast - The AST to serialize
   * @returns The JSON string representation
   */
  serialize(ast: ArtifactAST): string {
    const jsValue = nodeToJsValue(ast.root)
    return JSON.stringify(jsValue, null, 2)
  }

  /**
   * Serializes a single AST node and its descendants to a pretty-printed JSON string.
   *
   * @param node - The AST node to serialize
   * @returns The JSON string representation of the node
   */
  renderSubtree(node: ArtifactNode): string {
    const jsValue = nodeToJsValue(node)
    return JSON.stringify(jsValue, null, 2)
  }

  /**
   * Returns the static node type descriptors for JSON format.
   *
   * @returns An array of node type descriptors describing addressable JSON node types
   */
  nodeTypes(): readonly NodeTypeDescriptor[] {
    return [
      {
        type: 'document',
        identifiedBy: [],
        description: 'Root node of a JSON document.',
      },
      {
        type: 'object',
        identifiedBy: [],
        description: 'A JSON object containing property nodes.',
      },
      {
        type: 'property',
        identifiedBy: ['matches'],
        description: 'A key–value entry in a JSON object. `matches` targets the key name.',
      },
      {
        type: 'array',
        identifiedBy: [],
        description: 'A JSON array containing array-item nodes.',
      },
      {
        type: 'array-item',
        identifiedBy: ['index', 'where'],
        description:
          'An item in a JSON array. Use `index` for zero-based position or `where` for object items.',
      },
    ]
  }

  /**
   * Returns a simplified navigable outline of the JSON artifact's addressable nodes.
   *
   * @param ast - The AST to generate an outline for
   * @returns A flat list of outline entries with nesting depth
   */
  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const entries: OutlineEntry[] = []
    const rootNode = ast.root.children?.[0]
    if (!rootNode) return entries
    this.collectOutlineEntries(rootNode, 0, entries)
    return entries
  }

  /**
   * Recursively collects outline entries for objects and arrays.
   *
   * @param node - The current AST node being processed
   * @param depth - The nesting depth (0 = root children)
   * @param entries - Accumulator for outline entries
   */
  private collectOutlineEntries(node: ArtifactNode, depth: number, entries: OutlineEntry[]): void {
    if (node.type === 'object') {
      for (const prop of node.children ?? []) {
        const children: OutlineEntry[] = []
        if (prop.children && prop.children.length > 0) {
          this.collectOutlineEntries(prop.children[0]!, depth + 1, children)
        }
        entries.push({
          type: 'property',
          label: prop.label ?? '',
          depth,
          ...(children.length > 0 ? { children } : {}),
        })
      }
    } else if (node.type === 'array') {
      for (let i = 0; i < (node.children ?? []).length; i++) {
        const item = node.children![i]!
        const children: OutlineEntry[] = []
        if (item.children && item.children.length > 0) {
          this.collectOutlineEntries(item.children[0]!, depth + 1, children)
        }
        entries.push({
          type: 'array-item',
          label: `[${i}]`,
          depth,
          ...(children.length > 0 ? { children } : {}),
        })
      }
    }
  }

  /**
   * Returns format-specific delta authoring instructions for injection into AI context.
   *
   * @returns A Markdown string describing JSON delta format and examples
   */
  deltaInstructions(): string {
    return `## JSON Delta Instructions

JSON files are parsed into a normalized AST with \`object\`, \`property\`, \`array\`, and \`array-item\` nodes.

### Node Types
- \`property\`: A key–value entry. Identified by \`matches\` (regex matched against key name).
- \`array-item\`: An item in an array. Identified by \`index\` (zero-based) or \`where\` (for object items).
- \`object\`: A JSON object. Contains \`property\` children.
- \`array\`: A JSON array. Contains \`array-item\` children.

### Selector Fields
- \`type\`: One of \`property\`, \`array-item\`, \`object\`, \`array\`.
- \`matches\`: Regex matched against key name (for \`property\`).
- \`parent\`: Constrains search to descendants of a matched parent node.
- \`index\`: Zero-based index for \`array-item\`.
- \`where\`: Key-value match for object array items.

### Delta Examples
\`\`\`yaml
# Modify a property value
- op: modified
  selector:
    type: property
    matches: version
  value: '2.0.0'

# Append to an array
- op: modified
  selector:
    type: property
    matches: keywords
  strategy: append
  value:
    - 'new-keyword'

# Add a new property
- op: added
  position:
    parent:
      type: object
  value:
    newKey: newValue

# Remove a property
- op: removed
  selector:
    type: property
    matches: oldKey
\`\`\``
  }

  /**
   * JSON files do not serve as delta files; always returns an empty array.
   *
   * @returns An empty array
   */
  parseDelta(): readonly DeltaEntry[] {
    return []
  }
}

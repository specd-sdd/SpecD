import {
  type ArtifactAST,
  type ArtifactNode,
  type ArtifactParser,
  type DeltaEntry,
  type NodeTypeDescriptor,
  type OutlineEntry,
} from '../../application/ports/artifact-parser.js'
import { applyDelta } from './_shared/apply-delta.js'

type ScalarValue = string | number | boolean | null

function jsScalarToValue(v: unknown): ScalarValue {
  if (v === null) return null
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  return JSON.stringify(v)
}

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

export class JsonParser implements ArtifactParser {
  get fileExtensions(): readonly string[] {
    return ['.json']
  }

  parse(content: string): ArtifactAST {
    const jsValue = JSON.parse(content) as unknown
    const rootNode = jsValueToNode(jsValue)
    return { root: { type: 'document', children: [rootNode] } }
  }

  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST {
    return applyDelta(ast, delta, (c) => this.parse(c), jsonValueToNode)
  }

  serialize(ast: ArtifactAST): string {
    const jsValue = nodeToJsValue(ast.root)
    return JSON.stringify(jsValue, null, 2)
  }

  renderSubtree(node: ArtifactNode): string {
    const jsValue = nodeToJsValue(node)
    return JSON.stringify(jsValue, null, 2)
  }

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

  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const entries: OutlineEntry[] = []
    const rootNode = ast.root.children?.[0]
    if (!rootNode) return entries
    this.collectOutlineEntries(rootNode, 0, entries)
    return entries
  }

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

  parseDelta(): readonly DeltaEntry[] {
    return []
  }
}

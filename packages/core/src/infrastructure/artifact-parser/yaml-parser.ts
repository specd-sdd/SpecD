import { parse as parseYaml, parseDocument, stringify, YAMLMap, YAMLSeq, Scalar } from 'yaml'
import type { Document } from 'yaml'
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

function scalarToValue(s: Scalar): ScalarValue {
  const v = s.value
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v
  }
  return JSON.stringify(v)
}

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

function artifactPairToJsValue(pair: ArtifactNode): unknown {
  if (pair.children && pair.children.length > 0) {
    return artifactNodeToJsValue(pair.children[0]!)
  }
  return pair.value ?? null
}

function artifactSequenceItemToJsValue(item: ArtifactNode): unknown {
  if (item.children && item.children.length > 0) {
    return artifactNodeToJsValue(item.children[0]!)
  }
  return item.value ?? null
}

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

export class YamlParser implements ArtifactParser {
  get fileExtensions(): readonly string[] {
    return ['.yaml', '.yml']
  }

  parse(content: string): ArtifactAST {
    const doc = parseDocument(content)
    return documentToArtifactAST(doc, content)
  }

  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST {
    return applyDelta(ast, delta, (c) => this.parse(c), yamlValueToNode)
  }

  serialize(ast: ArtifactAST): string {
    const yamlStr = (ast.root as Record<string, unknown>)['_yaml']
    if (typeof yamlStr === 'string') {
      return yamlStr
    }
    const jsValue = artifactNodeToJsValue(ast.root)
    return stringify(jsValue)
  }

  renderSubtree(node: ArtifactNode): string {
    const jsValue = artifactNodeToJsValue(node)
    return stringify(jsValue)
  }

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

  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const entries: OutlineEntry[] = []
    this.collectOutlineEntries(ast.root, 0, entries)
    return entries
  }

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

  parseDelta(content: string): readonly DeltaEntry[] {
    const parsed = parseYaml(content) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed as DeltaEntry[]
  }
}

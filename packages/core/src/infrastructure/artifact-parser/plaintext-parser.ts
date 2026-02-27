import {
  type ArtifactAST,
  type ArtifactNode,
  type ArtifactParser,
  type DeltaEntry,
  type NodeTypeDescriptor,
  type OutlineEntry,
} from '../../application/ports/artifact-parser.js'
import { applyDelta } from './_shared/apply-delta.js'

export class PlaintextParser implements ArtifactParser {
  get fileExtensions(): readonly string[] {
    return ['.txt', '.text']
  }

  parse(content: string): ArtifactAST {
    if (content.trim() === '') {
      return { root: { type: 'document', children: [] } }
    }
    const paragraphs = content.split(/\n\n/)
    const children: ArtifactNode[] = paragraphs
      .filter((p) => p.trim() !== '')
      .map((p) => ({
        type: 'paragraph',
        value: p,
      }))
    return { root: { type: 'document', children } }
  }

  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST {
    return applyDelta(
      ast,
      delta,
      (content) => this.parse(content),
      (value, { nodeType }) => {
        if (typeof value === 'string') {
          return { type: nodeType === 'unknown' ? 'paragraph' : nodeType, value }
        }
        return { type: 'paragraph', value: String(value) }
      },
    )
  }

  serialize(ast: ArtifactAST): string {
    const children = ast.root.children ?? []
    return children.map((c) => (typeof c.value === 'string' ? c.value : '')).join('\n\n')
  }

  renderSubtree(node: ArtifactNode): string {
    switch (node.type) {
      case 'document': {
        const children = node.children ?? []
        return children.map((c) => (typeof c.value === 'string' ? c.value : '')).join('\n\n')
      }
      case 'paragraph':
      case 'line':
        return typeof node.value === 'string' ? node.value : ''
      default:
        return typeof node.value === 'string' ? node.value : ''
    }
  }

  nodeTypes(): readonly NodeTypeDescriptor[] {
    return [
      {
        type: 'document',
        identifiedBy: [],
        description: 'Root node of a plain text document.',
      },
      {
        type: 'paragraph',
        identifiedBy: ['contains'],
        description: 'A block of text separated from other blocks by blank lines.',
      },
      {
        type: 'line',
        identifiedBy: ['contains'],
        description: 'A single line of text within a document.',
      },
    ]
  }

  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const children = ast.root.children ?? []
    return children.map((c) => ({
      type: 'paragraph',
      label: (typeof c.value === 'string' ? c.value : '').slice(0, 50),
      depth: 0,
    }))
  }

  deltaInstructions(): string {
    return `## Plain Text Delta Instructions

Plain text files are parsed into paragraph nodes separated by blank lines.

### Node Types
- \`paragraph\`: A block of text. Identified by \`contains\` (regex matched against value).

### Selector Fields
- \`type\`: Always \`paragraph\` for content blocks.
- \`contains\`: Regex matched case-insensitively against the paragraph's text content.

### Delta Example
\`\`\`yaml
- op: modified
  selector:
    type: paragraph
    contains: "old text"
  content: |
    New replacement paragraph text.

- op: added
  content: |
    New paragraph appended at end.

- op: removed
  selector:
    type: paragraph
    contains: "text to remove"
\`\`\``
  }

  parseDelta(): readonly DeltaEntry[] {
    return []
  }
}

import {
  type ArtifactAST,
  type ArtifactNode,
  type ArtifactParser,
  type DeltaEntry,
  type NodeTypeDescriptor,
  type OutlineEntry,
} from '../../application/ports/artifact-parser.js'
import { applyDelta } from './_shared/apply-delta.js'

/** {@link ArtifactParser} implementation for plain text files. */
export class PlaintextParser implements ArtifactParser {
  /** File extensions this adapter handles. */
  get fileExtensions(): readonly string[] {
    return ['.txt', '.text']
  }

  /**
   * Parses plain text content into a normalized `ArtifactAST` by splitting on blank lines.
   *
   * @param content - The plain text content to parse
   * @returns The normalized AST with a `document` root containing `paragraph` children
   */
  parse(content: string): ArtifactAST {
    if (content.trim() === '') {
      return { root: { type: 'document', children: [] } }
    }
    const normalized = content.replace(/\r\n/g, '\n')
    const paragraphs = normalized.split(/\n\n/)
    const children: ArtifactNode[] = paragraphs
      .filter((p) => p.trim() !== '')
      .map((p) => ({
        type: 'paragraph',
        value: p,
      }))
    return { root: { type: 'document', children } }
  }

  /**
   * Applies delta entries to the plain text AST.
   *
   * @param ast - The base AST to apply the delta to
   * @param delta - The ordered list of delta entries
   * @returns A new AST with all delta operations applied
   */
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

  /**
   * Serializes a plain text AST back to a string by joining paragraphs with blank lines.
   *
   * @param ast - The AST to serialize
   * @returns The plain text string representation
   */
  serialize(ast: ArtifactAST): string {
    const children = ast.root.children ?? []
    return children.map((c) => (typeof c.value === 'string' ? c.value : '')).join('\n\n')
  }

  /**
   * Serializes a single AST node and its descendants to a plain text string.
   *
   * @param node - The AST node to serialize
   * @returns The plain text string representation of the node
   */
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

  /**
   * Returns the static node type descriptors for plain text format.
   *
   * @returns An array of node type descriptors describing addressable plain text node types
   */
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

  /**
   * Returns a simplified navigable outline of the plain text artifact's paragraphs.
   *
   * @param ast - The AST to generate an outline for
   * @returns A flat list of paragraph outline entries with depth 0
   */
  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const children = ast.root.children ?? []
    return children.map((c) => ({
      type: 'paragraph',
      label: (typeof c.value === 'string' ? c.value : '').slice(0, 50),
      depth: 0,
    }))
  }

  /**
   * Returns format-specific delta authoring instructions for injection into AI context.
   *
   * @returns A Markdown string describing plain text delta format and examples
   */
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

  /**
   * Plain text files do not serve as delta files; always returns an empty array.
   *
   * @returns An empty array
   */
  parseDelta(): readonly DeltaEntry[] {
    return []
  }
}

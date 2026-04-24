import {
  type ArtifactAST,
  type ArtifactNode,
  type ArtifactParser,
  type DeltaApplicationResult,
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
        children: p.split('\n').map((line) => ({ type: 'line', value: line })),
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
  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): DeltaApplicationResult {
    const descriptorMap = new Map(this.nodeTypes().map((d) => [d.type, d]))
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
      descriptorMap,
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
    return children.map((c) => this._serializeParagraph(c)).join('\n\n')
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
        return children.map((c) => this._serializeParagraph(c)).join('\n\n')
      }
      case 'paragraph':
        return this._serializeParagraph(node)
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
        isCollection: false,
        isSequence: false,
        isSequenceItem: false,
        isContainer: true,
        isLeaf: false,
      },
      {
        type: 'paragraph',
        identifiedBy: ['contains'],
        description: 'A block of text separated from other blocks by blank lines.',
        isCollection: true,
        isSequence: false,
        isSequenceItem: false,
        isContainer: false,
        isLeaf: false,
      },
      {
        type: 'line',
        identifiedBy: ['contains'],
        description: 'A single line of text within a document.',
        isCollection: false,
        isSequence: false,
        isSequenceItem: false,
        isContainer: false,
        isLeaf: true,
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
      label: this._serializeParagraph(c).slice(0, 50),
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
\`\`\`

### Description Field

All delta entries accept an optional \`description\` field (string) to document what the entry does or why. It is ignored during application.

\`\`\`yaml
- op: modified
  description: "Update introduction paragraph"
  selector:
    type: paragraph
    contains: "old text"
  content: |
    New replacement paragraph text.
\`\`\`

### No-op Operation

Use \`op: no-op\` when the artifact requires no changes for this spec. A \`no-op\` entry must be the only entry in the delta array. It accepts only \`op\` and optionally \`description\` — no other fields are valid.

\`\`\`yaml
- op: no-op
  description: "Existing content remains valid — no changes needed"
\`\`\``
  }

  /**
   * Plain text files do not serve as delta files; always returns an empty array.
   *
   * @param _content - Unused; accepted for interface conformance
   * @returns An empty array
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseDelta(_content: string): readonly DeltaEntry[] {
    return []
  }

  /**
   * Serializes a paragraph node by joining its `line` children, falling back to `value`.
   *
   * @param node - The paragraph node to serialize
   * @returns The plain text of the paragraph
   */
  private _serializeParagraph(node: ArtifactNode): string {
    if (node.children && node.children.length > 0) {
      return node.children.map((l) => (typeof l.value === 'string' ? l.value : '')).join('\n')
    }
    return typeof node.value === 'string' ? node.value : ''
  }
}

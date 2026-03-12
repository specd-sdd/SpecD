import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import {
  type ArtifactAST,
  type ArtifactNode,
  type ArtifactParser,
  type DeltaEntry,
  type NodeTypeDescriptor,
  type OutlineEntry,
} from '../../application/ports/artifact-parser.js'
import { applyDelta } from './_shared/apply-delta.js'

// We use duck typing for MDAST nodes to avoid needing 'mdast' as a direct dep.
/** Duck-typed MDAST node with an arbitrary extension bag. */
interface MdastNode {
  type: string
  [key: string]: unknown
}

/** An MDAST node that may contain child nodes. */
interface MdastParent extends MdastNode {
  children: MdastNode[]
}

/** An MDAST heading node with depth and inline children. */
interface MdastHeading extends MdastParent {
  type: 'heading'
  depth: number
  children: MdastInline[]
}

/** An MDAST inline node such as text or emphasis. */
interface MdastInline extends MdastNode {
  value?: string
  children?: MdastInline[]
}

/** The root MDAST node of a parsed Markdown document. */
interface MdastRoot extends MdastParent {
  type: 'root'
  children: MdastNode[]
}

/**
 * Extracts text from inline MDAST nodes, preserving link syntax.
 *
 * @param nodes - The inline MDAST nodes to extract text from
 * @returns The concatenated text content with markdown links preserved as `[text](url)`
 */
function extractText(nodes: readonly MdastInline[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'link') {
        const text = Array.isArray(n.children) ? extractText(n.children) : ''
        const url = (n as unknown as { url: string }).url ?? ''
        return `[${text}](${url})`
      }
      if (typeof n.value === 'string') return n.value
      if (Array.isArray(n.children)) return extractText(n.children)
      return ''
    })
    .join('')
}

/** An entry in the section-nesting stack used during AST construction. */
interface StackEntry {
  level: number
  node: ArtifactNode & { children: ArtifactNode[] }
}

/**
 * Converts an MDAST block node (non-heading) to a normalized AST node.
 *
 * @param node - The MDAST block node to convert
 * @returns The normalized `ArtifactNode`, or `null` if the node type is unsupported
 */
function convertBlockNode(node: MdastNode): ArtifactNode | null {
  if (node.type === 'paragraph') {
    const inlines = (node as MdastParent).children as MdastInline[]
    const text = extractText(inlines)
    return { type: 'paragraph', value: text, _inlines: inlines }
  }

  if (node.type === 'code') {
    const lang = (node as { lang?: string | null }).lang
    const value = (node as { value?: string }).value ?? ''
    if (lang) {
      return { type: 'code-block', label: lang, value }
    }
    return { type: 'code-block', value }
  }

  if (node.type === 'thematicBreak') {
    return { type: 'thematic-break' }
  }

  if (node.type === 'list') {
    const ordered = (node as { ordered?: boolean | null }).ordered === true
    const children = (node as MdastParent).children.map((item) =>
      convertListItem(item as MdastParent),
    )
    return { type: 'list', ordered, children }
  }

  if (node.type === 'blockquote') {
    const texts: string[] = []
    for (const child of (node as MdastParent).children) {
      const converted = convertBlockNode(child)
      if (converted && typeof converted.value === 'string') {
        texts.push(`> ${converted.value}`)
      }
    }
    return { type: 'paragraph', value: texts.join('\n') }
  }

  if (node.type === 'html') {
    return { type: 'paragraph', value: (node as { value?: string }).value ?? '' }
  }

  if (typeof (node as { value?: unknown }).value === 'string') {
    const n = node as unknown as { value: string }
    return { type: 'paragraph', value: n.value }
  }

  return null
}

/**
 * Converts an MDAST list item node into a normalized `list-item` AST node.
 *
 * @param item - The MDAST list item to convert
 * @returns A `list-item` `ArtifactNode` with label and optional sub-list children
 */
function convertListItem(item: MdastParent): ArtifactNode {
  const textParts: string[] = []
  const inlineParts: MdastInline[][] = []
  const subLists: ArtifactNode[] = []

  for (const child of item.children) {
    if (child.type === 'paragraph') {
      const inlines = (child as MdastParent).children as MdastInline[]
      textParts.push(extractText(inlines))
      inlineParts.push(inlines)
    } else if (child.type === 'list') {
      const converted = convertBlockNode(child)
      if (converted) subLists.push(converted)
    }
  }

  const label = textParts.join(' ')
  const _inlines =
    inlineParts.length === 1
      ? inlineParts[0]
      : inlineParts.flatMap((p, i) =>
          i > 0 ? [{ type: 'text', value: ' ' } as MdastInline, ...p] : p,
        )
  if (subLists.length > 0) {
    return { type: 'list-item', label, _inlines, children: subLists }
  }
  return { type: 'list-item', label, _inlines }
}

/** {@link ArtifactParser} implementation for Markdown files. */
export class MarkdownParser implements ArtifactParser {
  /** File extensions this adapter handles. */
  get fileExtensions(): readonly string[] {
    return ['.md']
  }

  /**
   * Parses Markdown content into a normalized `ArtifactAST` using a sectionize algorithm.
   *
   * @param content - The Markdown content to parse
   * @returns The normalized AST with a `document` root node containing `section` and block children
   */
  parse(content: string): ArtifactAST {
    const mdast = fromMarkdown(content) as unknown as MdastRoot
    return this.mdastToAst(mdast)
  }

  /**
   * Converts an MDAST root into a normalized `ArtifactAST` by sectionizing headings.
   *
   * @param mdast - The MDAST root node to convert
   * @returns The normalized AST
   */
  private mdastToAst(mdast: MdastRoot): ArtifactAST {
    const docNode: ArtifactNode & { children: ArtifactNode[] } = {
      type: 'document',
      children: [],
    }

    const stack: StackEntry[] = [{ level: 0, node: docNode }]

    for (const child of mdast.children) {
      if (child.type === 'heading') {
        const heading = child as unknown as MdastHeading
        const level = heading.depth
        const label = extractText(heading.children)

        const section: ArtifactNode & { children: ArtifactNode[] } = {
          type: 'section',
          label,
          level,
          children: [],
        }

        // Pop stack until top has level < this heading's level
        while (stack.length > 1 && stack[stack.length - 1]!.level >= level) {
          stack.pop()
        }

        stack[stack.length - 1]!.node.children.push(section)
        stack.push({ level, node: section })
      } else {
        const converted = convertBlockNode(child)
        if (converted !== null) {
          stack[stack.length - 1]!.node.children.push(converted)
        }
      }
    }

    return { root: docNode }
  }

  /**
   * Applies delta entries to the Markdown AST.
   *
   * @param ast - The base AST to apply the delta to
   * @param delta - The ordered list of delta entries
   * @returns A new AST with all delta operations applied
   */
  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST {
    return applyDelta(
      ast,
      delta,
      (c) => this.parse(c),
      (v) => ({ type: 'paragraph', value: String(v) }),
    )
  }

  /**
   * Serializes a Markdown AST back to a Markdown string.
   *
   * @param ast - The AST to serialize
   * @returns The Markdown string representation
   */
  serialize(ast: ArtifactAST): string {
    const mdastRoot = this.astToMdast(ast.root)
    return toMarkdown(mdastRoot as Parameters<typeof toMarkdown>[0])
  }

  /**
   * Serializes a single AST node and its descendants to a Markdown string.
   *
   * @param node - The AST node to serialize
   * @returns The Markdown string representation of the node
   */
  renderSubtree(node: ArtifactNode): string {
    if (node.type === 'document') {
      return this.serialize({ root: node })
    }
    const mdastNodes = this.nodeToMdastNodes(node)
    const root: MdastRoot = { type: 'root', children: mdastNodes }
    return toMarkdown(root as Parameters<typeof toMarkdown>[0])
  }

  /**
   * Converts a normalized AST node into an MDAST root for serialization.
   *
   * @param node - The AST node to convert
   * @returns An MDAST root containing the converted nodes
   */
  private astToMdast(node: ArtifactNode): MdastRoot {
    const children: MdastNode[] = []
    this.collectMdastFromNode(node, children)
    return { type: 'root', children }
  }

  /**
   * Recursively collects MDAST nodes from a normalized AST node into the output array.
   *
   * @param node - The normalized AST node to convert
   * @param out - Accumulator array for the resulting MDAST nodes
   */
  private collectMdastFromNode(node: ArtifactNode, out: MdastNode[]): void {
    if (node.type === 'document') {
      for (const child of node.children ?? []) {
        this.collectMdastFromNode(child, out)
      }
      return
    }
    const nodes = this.nodeToMdastNodes(node)
    for (const n of nodes) {
      out.push(n)
    }
  }

  /**
   * Converts a single normalized AST node to its MDAST equivalent nodes.
   *
   * @param node - The normalized AST node to convert
   * @returns An array of MDAST nodes representing the normalized node
   */
  private nodeToMdastNodes(node: ArtifactNode): MdastNode[] {
    if (node.type === 'section') {
      const depth = (node.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6
      const heading: MdastNode = {
        type: 'heading',
        depth,
        children: [{ type: 'text', value: node.label ?? '' }],
      }
      const result: MdastNode[] = [heading]
      for (const child of node.children ?? []) {
        const converted = this.nodeToMdastNodes(child)
        for (const c of converted) {
          result.push(c)
        }
      }
      return result
    }

    if (node.type === 'paragraph') {
      const inlines = node._inlines as MdastInline[] | undefined
      return [
        {
          type: 'paragraph',
          children: inlines ?? [
            { type: 'text', value: typeof node.value === 'string' ? node.value : '' },
          ],
        },
      ]
    }

    if (node.type === 'code-block') {
      return [
        {
          type: 'code',
          lang: node.label ?? null,
          value: typeof node.value === 'string' ? node.value : '',
        },
      ]
    }

    if (node.type === 'thematic-break') {
      return [{ type: 'thematicBreak' }]
    }

    if (node.type === 'list') {
      const listItems: MdastNode[] = (node.children ?? []).map((item) => {
        const inlines = item._inlines as MdastInline[] | undefined
        const itemContent: MdastNode[] = [
          {
            type: 'paragraph',
            children: inlines ?? [{ type: 'text', value: item.label ?? '' }],
          },
        ]
        for (const subNode of item.children ?? []) {
          const converted = this.nodeToMdastNodes(subNode)
          for (const c of converted) {
            itemContent.push(c)
          }
        }
        return { type: 'listItem', spread: false, children: itemContent }
      })
      return [
        {
          type: 'list',
          ordered: node.ordered === true,
          spread: false,
          children: listItems,
        },
      ]
    }

    return []
  }

  /**
   * Returns the static node type descriptors for Markdown format.
   *
   * @returns An array of node type descriptors describing addressable Markdown node types
   */
  nodeTypes(): readonly NodeTypeDescriptor[] {
    return [
      {
        type: 'document',
        identifiedBy: [],
        description: 'Root node of a markdown document.',
      },
      {
        type: 'section',
        identifiedBy: ['matches'],
        description:
          'A heading and all content until the next heading of equal or lesser depth. `matches` targets the heading text.',
      },
      {
        type: 'paragraph',
        identifiedBy: ['contains'],
        description: 'A prose block. `contains` matches against paragraph text.',
      },
      {
        type: 'list',
        identifiedBy: [],
        description: 'A bullet or numbered list.',
      },
      {
        type: 'list-item',
        identifiedBy: ['matches'],
        description: 'An individual list entry. `matches` targets the item text.',
      },
      {
        type: 'code-block',
        identifiedBy: ['matches'],
        description: 'A fenced code block. `matches` targets the language identifier.',
      },
      {
        type: 'thematic-break',
        identifiedBy: [],
        description: 'A horizontal rule.',
      },
    ]
  }

  /**
   * Returns a simplified navigable outline of the Markdown artifact's section hierarchy.
   *
   * @param ast - The AST to generate an outline for
   * @returns A nested list of section outline entries
   */
  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const entries: OutlineEntry[] = []
    this.collectOutlineEntries(ast.root, entries)
    return entries
  }

  /**
   * Recursively collects section nodes into the outline entries list.
   *
   * @param node - The current AST node being processed
   * @param entries - Accumulator for outline entries
   */
  private collectOutlineEntries(node: ArtifactNode, entries: OutlineEntry[]): void {
    if (node.type === 'document') {
      for (const child of node.children ?? []) {
        this.collectOutlineEntries(child, entries)
      }
      return
    }
    if (node.type === 'section') {
      const depth = (node.level ?? 1) - 1
      const children: OutlineEntry[] = []
      for (const child of node.children ?? []) {
        if (child.type === 'section') {
          this.collectOutlineEntries(child, children)
        }
      }
      entries.push({
        type: 'section',
        label: node.label ?? '',
        depth,
        ...(children.length > 0 ? { children } : {}),
      })
    }
  }

  /**
   * Returns format-specific delta authoring instructions for injection into AI context.
   *
   * @returns A Markdown string describing Markdown delta format and examples
   */
  deltaInstructions(): string {
    return `## Markdown Delta Instructions

Markdown files are parsed into a normalized AST using a sectionize algorithm. Headings become \`section\` nodes; all content within a section becomes its children.

### Node Types
- \`section\`: A heading and all content until the next heading of equal or lesser depth. Identified by \`matches\` (regex matched against heading text, case-insensitive).
- \`paragraph\`: A prose block. Identified by \`contains\` (regex matched against paragraph text).
- \`list\`: A bullet or numbered list.
- \`list-item\`: An individual list entry. Identified by \`matches\` (against item text).
- \`code-block\`: A fenced code block. Identified by \`matches\` (against language identifier).
- \`thematic-break\`: A horizontal rule.

### Selector Fields
- \`type\`: One of the node types above.
- \`matches\`: Regex matched case-insensitively against the node's \`label\` (heading text, item text, code lang).
- \`contains\`: Regex matched against the node's \`value\` (paragraph text).
- \`parent\`: Constrains the search to nodes inside a specific parent section.

### Key Semantics
- For \`op: modified\` with \`content\`: the \`content\` is the **body only** — the heading/identifying line is preserved (or replaced via \`rename\`).
- For \`op: added\` with \`content\`: the \`content\` must start with the full heading line (e.g. \`### Heading\`) followed by the body.
- \`rename\` changes the heading text (identifying property) without touching the body.

### Delta Location
Delta files live at \`deltas/<workspace>/<capability-path>/<filename>.md.delta.yaml\`.

### Example
\`\`\`yaml
# Replace body of an existing section
- op: modified
  selector:
    type: section
    matches: 'Requirement: Login'
  content: |
    The system SHALL authenticate users with email and password.
    Failed attempts SHALL be rate-limited to 5 per minute.

# Rename a section
- op: modified
  selector:
    type: section
    matches: 'Requirement: Login'
  rename: 'Requirement: Authentication'

# Add a new section inside Requirements, after a specific sibling
- op: added
  position:
    parent:
      type: section
      matches: 'Requirements'
    after:
      type: section
      matches: 'Requirement: Logout'
  content: |
    ### Requirement: Password reset

    The system SHALL allow password reset via email link.

# Remove a section
- op: removed
  selector:
    type: section
    matches: 'Requirement: Old behaviour'
\`\`\``
  }

  /**
   * Markdown files do not serve as delta files; always returns an empty array.
   *
   * @param _content - Unused; accepted for interface conformance
   * @returns An empty array
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  parseDelta(_content: string): readonly DeltaEntry[] {
    return []
  }
}

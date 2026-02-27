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
interface MdastNode {
  type: string
  [key: string]: unknown
}

interface MdastParent extends MdastNode {
  children: MdastNode[]
}

interface MdastHeading extends MdastParent {
  type: 'heading'
  depth: number
  children: MdastInline[]
}

interface MdastInline extends MdastNode {
  value?: string
  children?: MdastInline[]
}

interface MdastRoot extends MdastParent {
  type: 'root'
  children: MdastNode[]
}

/** Extracts plain text from inline MDAST nodes. */
function extractText(nodes: readonly MdastInline[]): string {
  return nodes
    .map((n) => {
      if (typeof n.value === 'string') return n.value
      if (Array.isArray(n.children)) return extractText(n.children)
      return ''
    })
    .join('')
}

interface StackEntry {
  level: number
  node: ArtifactNode & { children: ArtifactNode[] }
}

/** Converts an MDAST block node (non-heading) to a normalized AST node. */
function convertBlockNode(node: MdastNode): ArtifactNode | null {
  if (node.type === 'paragraph') {
    const text = extractText((node as MdastParent).children as MdastInline[])
    return { type: 'paragraph', value: text }
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

function convertListItem(item: MdastParent): ArtifactNode {
  const textParts: string[] = []
  const subLists: ArtifactNode[] = []

  for (const child of item.children) {
    if (child.type === 'paragraph') {
      textParts.push(extractText((child as MdastParent).children as MdastInline[]))
    } else if (child.type === 'list') {
      const converted = convertBlockNode(child)
      if (converted) subLists.push(converted)
    }
  }

  const label = textParts.join(' ')
  if (subLists.length > 0) {
    return { type: 'list-item', label, children: subLists }
  }
  return { type: 'list-item', label }
}

export class MarkdownParser implements ArtifactParser {
  get fileExtensions(): readonly string[] {
    return ['.md']
  }

  parse(content: string): ArtifactAST {
    const mdast = fromMarkdown(content) as unknown as MdastRoot
    return this.mdastToAst(mdast)
  }

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

  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): ArtifactAST {
    return applyDelta(
      ast,
      delta,
      (c) => this.parse(c),
      (v) => ({ type: 'paragraph', value: String(v) }),
    )
  }

  serialize(ast: ArtifactAST): string {
    const mdastRoot = this.astToMdast(ast.root)
    return toMarkdown(mdastRoot as Parameters<typeof toMarkdown>[0])
  }

  renderSubtree(node: ArtifactNode): string {
    if (node.type === 'document') {
      return this.serialize({ root: node })
    }
    const mdastNodes = this.nodeToMdastNodes(node)
    const root: MdastRoot = { type: 'root', children: mdastNodes }
    return toMarkdown(root as Parameters<typeof toMarkdown>[0])
  }

  private astToMdast(node: ArtifactNode): MdastRoot {
    const children: MdastNode[] = []
    this.collectMdastFromNode(node, children)
    return { type: 'root', children }
  }

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
      return [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: typeof node.value === 'string' ? node.value : '' }],
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
        const itemContent: MdastNode[] = [
          {
            type: 'paragraph',
            children: [{ type: 'text', value: item.label ?? '' }],
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

  outline(ast: ArtifactAST): readonly OutlineEntry[] {
    const entries: OutlineEntry[] = []
    this.collectOutlineEntries(ast.root, entries)
    return entries
  }

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

  parseDelta(): readonly DeltaEntry[] {
    return []
  }
}

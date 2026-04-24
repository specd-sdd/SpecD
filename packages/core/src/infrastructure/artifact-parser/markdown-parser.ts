import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
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

/** Detected Markdown formatting style (bullet, emphasis, strong, rule markers). */
interface MarkdownStyleProfile {
  bullet: '-' | '*' | '+'
  emphasis: '*' | '_'
  strong: '*' | '_'
  rule: '*' | '-' | '_'
}

const MARKDOWN_STYLE_DEFAULTS: MarkdownStyleProfile = {
  bullet: '-',
  emphasis: '*',
  strong: '*',
  rule: '-',
}

/**
 * Collects unique capture-group matches from all occurrences of `re` in `content`.
 *
 * @param content - The string to search
 * @param re - The regular expression with capture groups
 * @param index - Which capture group to collect (default 1)
 * @returns Set of unique matched values
 */
function collectUniqueMatches(content: string, re: RegExp, index = 1): Set<string> {
  const values = new Set<string>()
  for (const match of content.matchAll(re)) {
    const value = match[index]
    if (value === undefined) continue
    values.add(value)
  }
  return values
}

/**
 * Returns the single detected marker if unambiguous, otherwise returns `fallback`.
 *
 * @param found - Set of detected markers
 * @param fallback - Default marker to use when ambiguous
 * @returns The chosen marker
 */
function chooseMarker<T extends string>(found: Set<T>, fallback: T): T {
  if (found.size === 1) {
    return found.values().next().value as T
  }
  return fallback
}

/**
 * Detects the Markdown formatting style used in `content`.
 *
 * @param content - The Markdown source to analyze
 * @returns The detected style profile
 */
function detectMarkdownStyle(content: string): MarkdownStyleProfile {
  const bullets = collectUniqueMatches(content, /(?:^|\n)[ \t]{0,3}([*+-])[ \t]+/g)
  const emphasis = collectUniqueMatches(content, /(^|[^*_])([*_])[^*\n_]+?\2(?!\2)/gm, 2)
  const strong = collectUniqueMatches(content, /(^|[^*_])([*_])\2[^*\n_]+?\2\2(?!\2)/gm, 2)
  const rules = collectUniqueMatches(
    content,
    /(?:^|\n)[ \t]{0,3}([*_-])(?:[ \t]*\1){2,}[ \t]*(?=\n|$)/g,
  )

  return {
    bullet: chooseMarker(
      bullets as Set<MarkdownStyleProfile['bullet']>,
      MARKDOWN_STYLE_DEFAULTS.bullet,
    ),
    emphasis: chooseMarker(
      emphasis as Set<MarkdownStyleProfile['emphasis']>,
      MARKDOWN_STYLE_DEFAULTS.emphasis,
    ),
    strong: chooseMarker(
      strong as Set<MarkdownStyleProfile['strong']>,
      MARKDOWN_STYLE_DEFAULTS.strong,
    ),
    rule: chooseMarker(rules as Set<MarkdownStyleProfile['rule']>, MARKDOWN_STYLE_DEFAULTS.rule),
  }
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
 * Appends a converted block node to a parent, normalizing adjacent unordered lists
 * into a single list so fallback bullet style can be applied uniformly.
 *
 * @param parent - Parent node that receives block children
 * @param converted - Converted block node to append
 */
function appendNormalizedBlockNode(
  parent: ArtifactNode & { children: ArtifactNode[] },
  converted: ArtifactNode,
): void {
  if (converted.type !== 'list' || converted.ordered === true) {
    parent.children.push(converted)
    return
  }

  const prev = parent.children[parent.children.length - 1]
  if (!prev || prev.type !== 'list' || prev.ordered === true) {
    parent.children.push(converted)
    return
  }

  const prevChildren = (prev.children ?? []) as ArtifactNode[]
  const nextChildren = (converted.children ?? []) as ArtifactNode[]
  ;(prev as unknown as { children: ArtifactNode[] }).children = [...prevChildren, ...nextChildren]
}

/**
 * Merges adjacent unordered list nodes so serialization can emit a single
 * canonical marker for ambiguous mixed-list input.
 *
 * @param children - Block-level children to normalize
 * @returns Normalized block-level children
 */
function normalizeBlockChildrenForSerialization(
  children: readonly ArtifactNode[] | undefined,
): ArtifactNode[] {
  if (!children || children.length === 0) return []

  const normalized: ArtifactNode[] = []
  for (const child of children) {
    const prev = normalized[normalized.length - 1]
    const canMerge =
      child.type === 'list' &&
      child.ordered !== true &&
      prev?.type === 'list' &&
      prev.ordered !== true

    if (!canMerge) {
      normalized.push(child)
      continue
    }

    const prevChildren = (prev.children ?? []) as ArtifactNode[]
    const nextChildren = (child.children ?? []) as ArtifactNode[]
    const merged: ArtifactNode = {
      ...prev,
      children: [...prevChildren, ...nextChildren],
    }
    normalized[normalized.length - 1] = merged
  }

  return normalized
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
    const start = (node as { start?: number | null }).start
    const children = (node as MdastParent).children.map((item) =>
      convertListItem(item as MdastParent),
    )
    if (ordered && typeof start === 'number') {
      return { type: 'list', ordered, start, children }
    }
    return { type: 'list', ordered, children }
  }

  if (node.type === 'blockquote') {
    const texts: string[] = []
    const convertedChildren: ArtifactNode[] = []
    for (const child of (node as MdastParent).children) {
      const converted = convertBlockNode(child)
      if (converted) {
        convertedChildren.push(converted)
      }
      if (converted && typeof converted.value === 'string') {
        texts.push(`> ${converted.value}`)
      }
    }
    return {
      type: 'paragraph',
      value: texts.join('\n'),
      _blockquoteChildren: convertedChildren,
    }
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
    return this.mdastToAst(mdast, content)
  }

  /**
   * Converts an MDAST root into a normalized `ArtifactAST` by sectionizing headings.
   *
   * @param mdast - The MDAST root node to convert
   * @param sourceContent - The original Markdown source for style detection
   * @returns The normalized AST
   */
  private mdastToAst(mdast: MdastRoot, sourceContent: string): ArtifactAST {
    const docNode: ArtifactNode & { children: ArtifactNode[] } = {
      type: 'document',
      _markdownStyle: detectMarkdownStyle(sourceContent),
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
          appendNormalizedBlockNode(stack[stack.length - 1]!.node, converted)
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
  apply(ast: ArtifactAST, delta: readonly DeltaEntry[]): DeltaApplicationResult {
    const descriptorMap = new Map(this.nodeTypes().map((d) => [d.type, d]))
    const result = applyDelta(
      ast,
      delta,
      (c) => this.parse(c),
      (v) => ({ type: 'paragraph', value: String(v) }),
      descriptorMap,
    )
    return result
  }

  /**
   * Serializes a Markdown AST back to a Markdown string.
   *
   * @param ast - The AST to serialize
   * @returns The Markdown string representation
   */
  serialize(ast: ArtifactAST): string {
    const mdastRoot = this.astToMdast(ast.root)
    return toMarkdown(
      mdastRoot as Parameters<typeof toMarkdown>[0],
      this.markdownOptionsFor(ast.root),
    )
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
    return toMarkdown(root as Parameters<typeof toMarkdown>[0], this.markdownOptionsFor(node))
  }

  /**
   * Builds mdast-util-to-markdown options from the node's detected style profile.
   *
   * @param node - The AST node whose style profile to use
   * @returns The markdown serialization options
   */
  private markdownOptionsFor(node: ArtifactNode): NonNullable<Parameters<typeof toMarkdown>[1]> {
    const style =
      (node._markdownStyle as MarkdownStyleProfile | undefined) ?? MARKDOWN_STYLE_DEFAULTS
    return {
      bullet: style.bullet,
      emphasis: style.emphasis,
      strong: style.strong,
      rule: style.rule,
      ruleRepetition: 3,
    }
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
      for (const child of normalizeBlockChildrenForSerialization(node.children)) {
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
      for (const child of normalizeBlockChildrenForSerialization(node.children)) {
        const converted = this.nodeToMdastNodes(child)
        for (const c of converted) {
          result.push(c)
        }
      }
      return result
    }

    if (node.type === 'paragraph') {
      const blockquoteChildren = node._blockquoteChildren as ArtifactNode[] | undefined
      if (Array.isArray(blockquoteChildren) && blockquoteChildren.length > 0) {
        const quoteNodes: MdastNode[] = []
        for (const child of blockquoteChildren) {
          const converted = this.nodeToMdastNodes(child)
          for (const c of converted) {
            quoteNodes.push(c)
          }
        }
        return [{ type: 'blockquote', children: quoteNodes }]
      }

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
          start:
            node.ordered === true && typeof (node as { start?: unknown }).start === 'number'
              ? ((node as unknown as { start: number }).start ?? 1)
              : null,
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
        isCollection: false,
        isSequence: false,
        isSequenceItem: false,
        isContainer: true,
        isLeaf: false,
      },
      {
        type: 'section',
        identifiedBy: ['matches'],
        description:
          'A heading and all content until the next heading of equal or lesser depth. `matches` targets the heading text.',
        isCollection: false,
        isSequence: false,
        isSequenceItem: false,
        isContainer: true,
        isLeaf: false,
      },
      {
        type: 'paragraph',
        identifiedBy: ['contains'],
        description: 'A prose block. `contains` matches against paragraph text.',
        isCollection: false,
        isSequence: false,
        isSequenceItem: false,
        isContainer: false,
        isLeaf: true,
      },
      {
        type: 'list',
        identifiedBy: [],
        description: 'A bullet or numbered list.',
        isCollection: true,
        isSequence: true,
        isSequenceItem: false,
        isContainer: true,
        isLeaf: false,
      },
      {
        type: 'list-item',
        identifiedBy: ['matches'],
        description: 'An individual list entry. `matches` targets the item text.',
        isCollection: false,
        isSequence: false,
        isSequenceItem: true,
        isContainer: true,
        isLeaf: false,
      },
      {
        type: 'code-block',
        identifiedBy: ['matches'],
        description: 'A fenced code block. `matches` targets the language identifier.',
        isCollection: false,
        isSequence: false,
        isSequenceItem: false,
        isContainer: false,
        isLeaf: true,
      },
      {
        type: 'thematic-break',
        identifiedBy: [],
        description: 'A horizontal rule.',
        isCollection: false,
        isSequence: false,
        isSequenceItem: false,
        isContainer: false,
        isLeaf: false,
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

### Key Semantics — CRITICAL

The selector targets a **parent node**. The \`content\` field replaces its **children** (body).
Think of it as: selector = container, content = what goes inside.

**\`op: modified\`**: The selector finds the node. \`content\` replaces its children (body only).
The node itself (heading line) is preserved — NEVER include the heading in \`content\`.
Use \`rename\` to change the heading text without touching the body.

**\`op: removed\`**: The selector finds the node. The entire node is deleted — the heading
AND all its children (body, nested sections, everything underneath).

**\`op: added\`**: No existing node to target — \`position\` says where to insert.
\`content\` is the **complete block** including the heading line (e.g. \`### Heading\`)
followed by the body, because there is no existing heading to preserve.

Common mistake: repeating the heading matched by the selector inside \`content\` of a
\`modified\` operation — this duplicates it. Only \`added\` needs the heading in content.

### Delta Location
Delta files live at \`deltas/<workspace>/<capability-path>/<filename>.md.delta.yaml\`.

### Example
\`\`\`yaml
# MODIFIED — body only, NO heading in content
# The heading "### Requirement: Login" is preserved automatically
- op: modified
  selector:
    type: section
    matches: 'Requirement: Login'
  content: |
    The system SHALL authenticate users with email and password.
    Failed attempts SHALL be rate-limited to 5 per minute.

# WRONG — this would DUPLICATE the heading:
# - op: modified
#   selector:
#     type: section
#     matches: 'Requirement: Login'
#   content: |
#     ### Requirement: Login        ← WRONG! Don't include this line
#     The system SHALL authenticate...

# RENAME — changes heading text, body untouched
- op: modified
  selector:
    type: section
    matches: 'Requirement: Login'
  rename: 'Requirement: Authentication'

# ADDED — heading MUST be included in content (no existing heading to preserve)
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

# REMOVED — delete a section
- op: removed
  selector:
    type: section
    matches: 'Requirement: Old behaviour'
\`\`\`

### Description Field

All delta entries accept an optional \`description\` field (string) to document what the entry does or why. It is ignored during application.

\`\`\`yaml
- op: modified
  description: "Update login to add rate limiting"
  selector:
    type: section
    matches: 'Requirement: Login'
  content: |
    The system SHALL authenticate users with email and password.
    Failed attempts SHALL be rate-limited to 5 per minute.
\`\`\`

### No-op Operation

Use \`op: no-op\` when the artifact requires no changes for this spec. A \`no-op\` entry must be the only entry in the delta array. It accepts only \`op\` and optionally \`description\` — no other fields are valid.

\`\`\`yaml
- op: no-op
  description: "Existing scenarios remain valid — no changes needed"
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

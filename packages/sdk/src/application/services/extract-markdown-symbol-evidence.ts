import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Root, Heading, Code, InlineCode, Text, Node } from 'mdast'

/**
 * Structural source level where Markdown evidence was observed.
 */
export type MarkdownEvidenceSource = 'fenced-code' | 'inline-code' | 'prose'

/**
 * Structural evidence entry extracted from Markdown content.
 */
export interface MarkdownSymbolEvidence {
  readonly candidate: string
  readonly kind: 'symbol' | 'file-path'
  readonly source: MarkdownEvidenceSource
  readonly sectionPath: readonly string[]
}

/**
 * Input for extracting symbol and file-path evidence from a Markdown document.
 */
export interface ExtractMarkdownSymbolEvidenceInput {
  readonly markdown: string
  readonly supportedExtensions: ReadonlySet<string>
  readonly supportedLanguages: ReadonlySet<string>
  readonly reservedKeywords: ReadonlySet<string>
}

export const SPEC_PROSE_KEYWORDS = new Set([
  'given',
  'when',
  'then',
  'must',
  'shall',
  'should',
  'each',
  'all',
  'more',
  'some',
  'only',
  'can',
  'may',
  'result',
  'status',
  'error',
  'message',
  'input',
  'output',
  'options',
  'target',
  'index',
  'array',
  'object',
  'set',
  'get',
  'after',
  'before',
  'first',
  'second',
  'third',
  'next',
  'last',
  'will',
  'into',
  'onto',
  'over',
  'under',
  'above',
  'below',
  'have',
  'has',
  'had',
  'been',
  'being',
  'does',
  'done',
  'did',
  'same',
  'such',
  'than',
  'that',
  'this',
  'they',
  'them',
  'their',
  'there',
  'here',
  'were',
  'what',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'whose',
  'why',
  'name',
  'key',
  'value',
  'base',
  'source',
  'mode',
  'data',
  'item',
  'list',
  'path',
  'file',
  'the',
  'and',
  'with',
])

const SOURCE_STRENGTH: Record<MarkdownEvidenceSource, number> = {
  'fenced-code': 3,
  'inline-code': 2,
  prose: 1,
}

/**
 * Checks whether a text term matches code identifier heuristics.
 *
 * @param term - Term to test
 * @returns True if term resembles a code identifier
 */
function isCodeIdentifierCandidate(term: string): boolean {
  const clean = term.replace(/\(.*\)$/, '').trim()
  if (/\(.*\)$/.test(term.trim())) {
    return true
  }
  if (clean.includes('.')) {
    return true
  }
  if (/^[A-Z][A-Za-z0-9_]*$/.test(clean) && clean.length >= 3) {
    return true
  }
  if (/^[a-z][a-zA-Z0-9_]*$/.test(clean) && /[A-Z]/.test(clean) && clean.length >= 3) {
    return true
  }
  return false
}

/**
 * Extracts plain text from a Markdown AST node and its children.
 *
 * @param node - AST node
 * @returns Extracted plain text string
 */
function extractNodeText(node: Node): string {
  if ('value' in node && typeof (node as { value: unknown }).value === 'string') {
    return (node as { value: string }).value
  }
  if ('children' in node && Array.isArray((node as { children: unknown[] }).children)) {
    return (node as { children: Node[] }).children.map(extractNodeText).join('')
  }
  return ''
}

/**
 * Extracts candidate symbol and file-path evidence from a Markdown document.
 *
 * @param input - Markdown source and language/keyword filter parameters
 * @returns Array of symbol and file-path evidence ordered and deduplicated by strongest source
 */
export function extractMarkdownSymbolEvidence(
  input: ExtractMarkdownSymbolEvidenceInput,
): readonly MarkdownSymbolEvidence[] {
  if (!input.markdown || !input.markdown.trim()) {
    return []
  }

  const root: Root = fromMarkdown(input.markdown)
  const rawEvidence: MarkdownSymbolEvidence[] = []
  const sectionHeadingStack: string[] = []

  const isReserved = (word: string): boolean => {
    const lower = word.toLowerCase()
    return SPEC_PROSE_KEYWORDS.has(lower) || input.reservedKeywords.has(lower)
  }

  const walk = (node: Node) => {
    if (node.type === 'heading') {
      const headingNode = node as Heading
      const depth = headingNode.depth
      const headingText = extractNodeText(headingNode).trim()

      while (sectionHeadingStack.length >= depth) {
        sectionHeadingStack.pop()
      }
      sectionHeadingStack.push(headingText)

      const currentSectionPath = [...sectionHeadingStack]

      // Extract prose symbols from heading text
      extractProseSymbols(headingText, currentSectionPath)

      // Traverse children of heading (like inlineCode inside headings)
      if ('children' in headingNode && Array.isArray(headingNode.children)) {
        for (const child of headingNode.children) {
          if (child.type === 'inlineCode') {
            processInlineCode(child, currentSectionPath)
          }
        }
      }
      return
    }

    const currentSectionPath = [...sectionHeadingStack]

    if (node.type === 'code') {
      const codeNode = node as Code
      const lang = (codeNode.lang ?? '').trim().toLowerCase()
      if (!lang || input.supportedLanguages.has(lang)) {
        const codeValue = codeNode.value ?? ''
        const identRegex = /\b[A-Za-z_][A-Za-z0-9_]*\b/g
        let idMatch: RegExpExecArray | null
        while ((idMatch = identRegex.exec(codeValue)) !== null) {
          const word = idMatch[0]
          if (word.length >= 3 && !isReserved(word) && isCodeIdentifierCandidate(word)) {
            rawEvidence.push({
              candidate: word,
              kind: 'symbol',
              source: 'fenced-code',
              sectionPath: currentSectionPath,
            })
          }
        }
      }
      return
    }

    if (node.type === 'inlineCode') {
      processInlineCode(node as InlineCode, currentSectionPath)
      return
    }

    if (node.type === 'text') {
      const textNode = node as Text
      extractProseSymbols(textNode.value ?? '', currentSectionPath)
      return
    }

    if ('children' in node && Array.isArray((node as { children: unknown[] }).children)) {
      for (const child of (node as { children: Node[] }).children) {
        walk(child)
      }
    }
  }

  /**
   * Processes inline code nodes for file paths and symbol candidates.
   *
   * @param inlineNode - MDAST inline code node
   * @param sectionPath - Heading hierarchy path
   */
  function processInlineCode(inlineNode: InlineCode, sectionPath: readonly string[]) {
    const rawVal = inlineNode.value ?? ''
    const cleanVal = rawVal.trim()
    if (!cleanVal) return

    // Check if inline code represents a file path
    const isFilePath = Array.from(input.supportedExtensions).some(
      (ext) => cleanVal.endsWith(ext) || cleanVal.includes(`${ext}:`),
    )
    if (isFilePath) {
      rawEvidence.push({
        candidate: cleanVal,
        kind: 'file-path',
        source: 'inline-code',
        sectionPath,
      })
    }

    // Check if inline code represents a code identifier candidate
    const cleanSym = cleanVal
      .replace(/\(.*\)$/, '')
      .replace(/.*\./, '')
      .trim()

    if (cleanSym.length >= 3 && !isReserved(cleanSym) && isCodeIdentifierCandidate(cleanSym)) {
      rawEvidence.push({
        candidate: cleanSym,
        kind: 'symbol',
        source: 'inline-code',
        sectionPath,
      })
    }
  }

  /**
   * Extracts candidate symbol references from prose text.
   *
   * @param text - Plain prose text
   * @param sectionPath - Heading hierarchy path
   */
  function extractProseSymbols(text: string, sectionPath: readonly string[]) {
    // Member-root and standard identifier extraction: e.g. Foo.bar, PascalCase, camelCase
    const tokenRegex = /\b[A-Za-z_][A-Za-z0-9_.]*\b/g
    let match: RegExpExecArray | null
    while ((match = tokenRegex.exec(text)) !== null) {
      const token = match[0]
      if (token.includes('.')) {
        const parts = token.split('.').filter((p) => p.length >= 3)
        for (const p of parts) {
          if (
            !isReserved(p) &&
            (isCodeIdentifierCandidate(p) ||
              /^[A-Z][a-zA-Z0-9_]*$/.test(p) ||
              /^[a-z][A-Za-z0-9_]*$/.test(p))
          ) {
            rawEvidence.push({
              candidate: p,
              kind: 'symbol',
              source: 'prose',
              sectionPath,
            })
          }
        }
      } else if (
        token.length >= 3 &&
        !isReserved(token) &&
        (isCodeIdentifierCandidate(token) ||
          (/^[A-Z][a-zA-Z0-9_]*$/.test(token) && /[a-z]/.test(token)) ||
          (/^[a-z][A-Za-z0-9_]*$/.test(token) && /[A-Z]/.test(token)))
      ) {
        rawEvidence.push({
          candidate: token,
          kind: 'symbol',
          source: 'prose',
          sectionPath,
        })
      }
    }
  }

  walk(root)

  // Deduplicate by (kind + candidate), keeping the strongest source (fenced-code > inline-code > prose),
  // and preserving earliest appearance order.
  const evidenceMap = new Map<string, { evidence: MarkdownSymbolEvidence; index: number }>()
  let sequence = 0

  for (const item of rawEvidence) {
    const key = `${item.kind}:${item.candidate}`
    const existing = evidenceMap.get(key)
    if (!existing) {
      evidenceMap.set(key, { evidence: item, index: sequence++ })
    } else {
      const existingStrength = SOURCE_STRENGTH[existing.evidence.source]
      const currentStrength = SOURCE_STRENGTH[item.source]
      if (currentStrength > existingStrength) {
        evidenceMap.set(key, { evidence: item, index: existing.index })
      }
    }
  }

  return Array.from(evidenceMap.values())
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.evidence)
}

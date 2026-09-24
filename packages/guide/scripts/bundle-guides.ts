import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GuideSection, GuideTopic } from '../src/domain/models/index.js'

export interface GuideFrontmatter {
  readonly title: string
  readonly description: string
  readonly sidebar_position: number
}

/**
 * Parses and validates Docusaurus YAML frontmatter from Markdown text.
 */
export function parseFrontmatter(
  content: string,
  filePath: string,
): { frontmatter: GuideFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
  if (!match) {
    throw new Error(
      `Frontmatter validation failed for file '${filePath}': Missing YAML frontmatter block (---)`,
    )
  }

  const [, rawYaml, body] = match
  const lines = rawYaml!.split(/\r?\n/)
  const record: Record<string, string> = {}

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue
    const key = trimmed.slice(0, colonIdx).trim()
    let value = trimmed.slice(colonIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    record[key] = value
  }

  const title = record.title
  if (!title || typeof title !== 'string' || !title.trim()) {
    throw new Error(
      `Frontmatter validation failed for file '${filePath}': 'title' is required and must be a non-empty string`,
    )
  }

  const description = record.description
  if (!description || typeof description !== 'string' || !description.trim()) {
    throw new Error(
      `Frontmatter validation failed for file '${filePath}': 'description' is required and must be a non-empty string`,
    )
  }

  const rawPosition = record.sidebar_position
  if (rawPosition === undefined || rawPosition === '') {
    throw new Error(
      `Frontmatter validation failed for file '${filePath}': 'sidebar_position' is required`,
    )
  }

  const sidebar_position = parseInt(rawPosition, 10)
  if (isNaN(sidebar_position) || sidebar_position < 0) {
    throw new Error(
      `Frontmatter validation failed for file '${filePath}': 'sidebar_position' must be an integer >= 0`,
    )
  }

  return {
    frontmatter: {
      title: title.trim(),
      description: description.trim(),
      sidebar_position,
    },
    body: body!,
  }
}

interface RawHeading {
  readonly heading: string
  readonly level: number
  readonly lineNumber: number
}

/**
 * Extracts sections and exact 1-indexed line spans from markdown content.
 */
export function extractSections(content: string): GuideSection[] {
  const lines = content.split(/\r?\n/)
  const rawHeadings: RawHeading[] = []
  let inCodeBlock = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const trimmed = line.trim()

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1]!.length
      const heading = headingMatch[2]!.trim()
      rawHeadings.push({
        heading,
        level,
        lineNumber: i + 1, // 1-indexed
      })
    }
  }

  const sections: GuideSection[] = []

  for (let i = 0; i < rawHeadings.length; i++) {
    const current = rawHeadings[i]!
    const startLine = current.lineNumber

    // Section ends at the line preceding the next heading of equal or shallower depth,
    // or at the end of the document.
    let endLine = lines.length

    for (let j = i + 1; j < rawHeadings.length; j++) {
      const next = rawHeadings[j]!
      if (next.level <= current.level) {
        endLine = next.lineNumber - 1
        break
      }
    }

    const sectionLines = lines.slice(startLine - 1, endLine)
    const sectionContent = sectionLines.join('\n')

    sections.push({
      index: i + 1, // 1-indexed sequential index
      heading: current.heading,
      level: current.level,
      startLine,
      endLine,
      lines: endLine - startLine + 1,
      content: sectionContent,
    })
  }

  return sections
}

/**
 * Compiles a single markdown guide into a GuideTopic domain entity.
 */
export function compileGuide(filePath: string, content: string): GuideTopic {
  const { frontmatter, body } = parseFrontmatter(content, filePath)
  const topic = path.basename(filePath, '.md').toLowerCase()
  const cleanBody = body.replace(/^\r?\n/, '')
  const lines = cleanBody.split(/\r?\n/)
  const sections = extractSections(cleanBody)

  return {
    topic,
    title: frontmatter.title,
    description: frontmatter.description,
    order: frontmatter.sidebar_position,
    content: cleanBody,
    lineCount: lines.length,
    byteLength: Buffer.byteLength(cleanBody, 'utf-8'),
    outline: sections,
  }
}

/**
 * Locates and bundles all guide files into the static TypeScript catalog.
 */
export function bundleGuides(docsDir: string, outputFile: string): void {
  if (!fs.existsSync(docsDir)) {
    throw new Error(`Documentation directory '${docsDir}' does not exist`)
  }

  const entries = fs.readdirSync(docsDir, { withFileTypes: true })
  const guideFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => path.join(docsDir, e.name))
    .sort()

  const topics: GuideTopic[] = []

  for (const file of guideFiles) {
    const raw = fs.readFileSync(file, 'utf-8')
    topics.push(compileGuide(file, raw))
  }

  // Sort by order ascending, then by topic alphabetically
  topics.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.topic.localeCompare(b.topic)
  })

  const indexMap: Record<string, number> = {}
  topics.forEach((t, idx) => {
    indexMap[t.topic] = idx
  })

  const code = `// GENERATED CODE - DO NOT EDIT MANUALLY
// Generated by packages/guide/scripts/bundle-guides.ts

import type { GuideTopic } from '../../domain/models/index.js'

export const GUIDES_CATALOG: readonly GuideTopic[] = ${JSON.stringify(topics, null, 2)} as const

export const GUIDES_INDEX: Readonly<Record<string, number>> = ${JSON.stringify(indexMap, null, 2)} as const
`

  const outDir = path.dirname(outputFile)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  fs.writeFileSync(outputFile, code, 'utf-8')
}

// Direct execution entrypoint
const currentFile = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  const rootDir = path.resolve(path.dirname(currentFile), '../../..')
  const docsDir = path.join(rootDir, 'docs/guide')
  const outputFile = path.join(
    path.dirname(currentFile),
    '../src/infrastructure/generated/guides.ts',
  )

  try {
    bundleGuides(docsDir, outputFile)
    console.log(`Successfully bundled guides to ${outputFile}`)
  } catch (err) {
    console.error((err as Error).message)
    process.exit(1)
  }
}

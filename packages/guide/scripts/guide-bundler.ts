import * as fs from 'node:fs'
import * as path from 'node:path'
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

  if (!/^\d+$/.test(rawPosition)) {
    throw new Error(
      `Frontmatter validation failed for file '${filePath}': 'sidebar_position' must be an integer >= 0`,
    )
  }
  const sidebar_position = Number(rawPosition)

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
  const lineStarts: number[] = []
  const lineEnds: number[] = []
  let pos = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    lineStarts.push(pos)
    lineEnds.push(pos + line.length)
    pos += line.length
    if (pos < content.length && content[pos] === '\r') {
      pos++
    }
    if (pos < content.length && content[pos] === '\n') {
      pos++
    }
  }

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
        lineNumber: i + 1,
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

    const startOffset = lineStarts[startLine - 1] ?? 0
    const endOffset = lineEnds[endLine - 1] ?? content.length

    sections.push({
      index: i + 1,
      heading: current.heading,
      level: current.level,
      startLine,
      endLine,
      lines: endLine - startLine + 1,
      startOffset,
      endOffset,
    })
  }

  return sections
}

/**
 * Compiles a single markdown guide into a GuideTopic domain entity.
 *
 * @param collection - Collection the document belongs to.
 * @param filePath - Absolute path of the source file, used in error messages.
 * @param relativePath - Path of the source file relative to its collection root.
 * @param content - Raw file contents including frontmatter.
 * @returns The compiled topic.
 */
export function compileGuide(
  collection: string,
  filePath: string,
  relativePath: string,
  content: string,
): GuideTopic {
  if (collection.includes(':')) {
    throw new Error(`Guide collection '${collection}' must not contain ':'`)
  }
  const { frontmatter, body } = parseFrontmatter(content, filePath)
  const topic = relativePath.replace(/\.md$/, '').toLowerCase()
  if (topic.includes(':')) {
    throw new Error(`Guide topic '${relativePath}' must not contain ':'`)
  }
  const cleanBody = body.replace(/^\r?\n/, '')
  const lines = cleanBody.split(/\r?\n/)
  const sections = extractSections(cleanBody)

  return {
    collection,
    topic,
    title: frontmatter.title,
    description: frontmatter.description,
    order: frontmatter.sidebar_position,
    sourcePath: relativePath,
    content: cleanBody,
    lineCount: lines.length,
    byteLength: Buffer.byteLength(cleanBody, 'utf-8'),
    outline: sections,
  }
}

/**
 * A documentation collection compiled into the guide catalog.
 */
export interface CollectionConfig {
  /** Canonical collection identifier, e.g. 'guide' or 'sdk'. */
  readonly collection: string
  /** Absolute path of the collection's source root. */
  readonly root: string
}

/**
 * Recursively collects every `.md` file beneath a root, ignoring `_category_.json`
 * and any other non-markdown asset.
 *
 * @param root - Absolute directory to traverse.
 * @returns Absolute file paths, sorted for deterministic output.
 */
export function collectMarkdownFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    throw new Error(`Documentation directory '${root}' does not exist`)
  }

  const results: string[] = []

  const walk = (dir: string): void => {
    for (const entry of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
        walk(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.endsWith('.md')) {
        results.push(fullPath)
      }
    }
  }

  walk(root)
  return results.sort()
}

/**
 * Compiles every configured collection root into guide topics.
 *
 * @param collections - Collection roots to compile.
 * @returns Topics for every collection, grouped in the configured order.
 * @throws Error When a configured root contains no Markdown documents.
 */
export function compileCollections(
  collections: readonly CollectionConfig[],
): Map<string, GuideTopic[]> {
  const byCollection = new Map<string, GuideTopic[]>()

  for (const config of collections) {
    const files = collectMarkdownFiles(config.root)
    if (files.length === 0) {
      throw new Error(
        `Collection '${config.collection}' source root '${config.root}' contains no Markdown documents`,
      )
    }

    const topics = files.map((file) =>
      compileGuide(
        config.collection,
        file,
        path.relative(config.root, file).split(path.sep).join('/'),
        fs.readFileSync(file, 'utf-8'),
      ),
    )

    topics.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order
      return a.topic.localeCompare(b.topic, 'en')
    })

    byCollection.set(config.collection, topics)
  }

  return byCollection
}

/**
 * Orders topics deterministically by collection, then navigation order, then topic.
 *
 * @param topics - Topics to sort.
 * @returns A new sorted array.
 */
export function sortTopics(topics: readonly GuideTopic[]): GuideTopic[] {
  return [...topics].sort((a, b) => {
    const byCollection = a.collection.localeCompare(b.collection, 'en')
    if (byCollection !== 0) return byCollection
    if (a.order !== b.order) return a.order - b.order
    return a.topic.localeCompare(b.topic, 'en')
  })
}

/**
 * Builds the `collection:topic` index map for a sorted catalog.
 *
 * @param topics - Catalog topics in their final order.
 * @returns Index mapping qualified identifiers to positions.
 */
export function buildIndexMap(topics: readonly GuideTopic[]): Record<string, number> {
  const index: Record<string, number> = {}
  topics.forEach((t, idx) => {
    index[`${t.collection}:${t.topic}`] = idx
  })
  return index
}

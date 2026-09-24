import { encode as encodeToon } from '@toon-format/toon'
import chalk from 'chalk'
import type { GuideSearchHit, GuideSummary } from '@specd/guide'
import { InvalidFormatError } from '../../errors/index.js'
import { colWidth, renderTable } from '../../helpers/table.js'

/**
 * Output format supported by the guide commands.
 */
export type GuideOutputFormat = 'text' | 'json' | 'toon'

const VALID_GUIDE_FORMATS: readonly string[] = ['text', 'json', 'toon']

/**
 * Validates and parses the `--format` flag for guide commands.
 *
 * @param raw - The raw format string passed by the user
 * @param defaultFormat - The fallback format if raw is not provided
 * @returns The parsed and validated guide output format
 * @throws {InvalidFormatError} If the format is not recognized
 */
export function parseGuideFormat(
  raw?: string,
  defaultFormat: GuideOutputFormat = 'text',
): GuideOutputFormat {
  if (!raw) {
    return defaultFormat
  }
  const lower = raw.toLowerCase().trim()
  if (!VALID_GUIDE_FORMATS.includes(lower)) {
    throw new InvalidFormatError(`invalid format '${raw}' — must be one of: text, json, toon`)
  }
  return lower as GuideOutputFormat
}

/**
 * Formats guide catalog listing.
 *
 * @param guides - The collection of guide summaries to format
 * @param format - The output format to render
 * @returns The formatted string
 */
export function formatGuideCatalog(
  guides: readonly GuideSummary[],
  format: GuideOutputFormat,
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(guides, null, 2)
    case 'toon':
      return encodeToon(guides)
    case 'text':
    default: {
      const rawTopics = guides.map((g) => g.topic)
      const rawTitles = guides.map((g) => g.title)
      const rawDescs = guides.map((g) => g.description)

      const columns = [
        { header: 'TOPIC', width: colWidth('TOPIC', rawTopics) },
        { header: 'TITLE', width: colWidth('TITLE', rawTitles) },
        {
          header: 'DESCRIPTION',
          width: Math.max(30, colWidth('DESCRIPTION', rawDescs)),
          overflow: 'wrap' as const,
        },
      ]

      return renderTable(
        null,
        columns,
        guides.map((g) => [g.topic, g.title, g.description]),
      )
    }
  }
}

/**
 * Structured guide outline entry.
 */
export interface GuideOutlineItem {
  /** 1-indexed sequential index */
  readonly index: number
  /** Heading title */
  readonly heading: string
  /** Heading depth level (1-6) */
  readonly level: number
  /** 1-indexed start line */
  readonly startLine: number
  /** 1-indexed end line */
  readonly endLine: number
  /** Total line count */
  readonly lines: number
}

/**
 * Payload representing guide document metadata and outline.
 */
export interface GuideMetadataPayload {
  /** Unique topic identifier */
  readonly topic: string
  /** Base filename */
  readonly file: string
  /** Total document lines */
  readonly lines: number
  /** Document size in bytes */
  readonly bytes: number
  /** Hierarchical outline sections */
  readonly outline: readonly GuideOutlineItem[]
}

/**
 * Formats guide metadata and outline.
 *
 * @param meta - Guide metadata payload
 * @param format - Output format
 * @returns Formatted metadata string
 */
export function formatGuideMetadata(meta: GuideMetadataPayload, format: GuideOutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(meta, null, 2)
    case 'toon':
      return encodeToon(meta)
    case 'text':
    default: {
      const stats = [
        `${chalk.bold('topic:')} ${meta.topic}`,
        `${chalk.bold('file:')}  ${meta.file}`,
        `${chalk.bold('lines:')} ${meta.lines}`,
        `${chalk.bold('bytes:')} ${meta.bytes}`,
        '',
      ]

      const rows = meta.outline.map((s) => ({
        index: String(s.index),
        heading: '  '.repeat(Math.max(0, s.level - 1)) + s.heading,
        level: String(s.level),
        startLine: String(s.startLine),
        endLine: String(s.endLine),
        lines: String(s.lines),
      }))

      const columns = [
        { header: 'INDEX', width: 6 },
        {
          header: 'HEADING',
          width: Math.min(
            50,
            Math.max(
              20,
              colWidth(
                'HEADING',
                rows.map((r) => r.heading),
              ),
            ),
          ),
          overflow: 'truncate' as const,
        },
        { header: 'LEVEL', width: 6 },
        { header: 'START', width: 6 },
        { header: 'END', width: 6 },
        { header: 'LINES', width: 6 },
      ]

      const table = renderTable(
        null,
        columns,
        rows.map((r) => [r.index, r.heading, r.level, r.startLine, r.endLine, r.lines]),
      )

      return stats.join('\n') + table
    }
  }
}

/**
 * Formats guide content or sliced window.
 *
 * @param topic - The guide topic
 * @param content - The raw or sliced content string
 * @param format - Output format
 * @returns Formatted content string
 */
export function formatGuideContent(
  topic: string,
  content: string,
  format: GuideOutputFormat,
): string {
  switch (format) {
    case 'json':
      return JSON.stringify({ topic, content }, null, 2)
    case 'toon':
      return encodeToon({ topic, content })
    case 'text':
    default:
      return content
  }
}

/**
 * Formats guide search results.
 *
 * @param hits - The search hit results
 * @param format - Output format
 * @returns Formatted search results string
 */
export function formatGuideSearchHits(
  hits: readonly GuideSearchHit[],
  format: GuideOutputFormat,
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(hits, null, 2)
    case 'toon':
      return encodeToon(hits)
    case 'text':
    default: {
      if (hits.length === 0) {
        return 'No matching guide sections found.'
      }
      const out: string[] = []
      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i]!
        out.push(
          `${chalk.bold.yellow(`[${i + 1}]`)} ${chalk.cyan(hit.topic)} > ${chalk.bold(hit.section)} ${chalk.dim(`(lines ${hit.startLine}-${hit.endLine}, score: ${hit.score.toFixed(2)})`)}`,
          hit.snippet,
          chalk.dim(`Read: ${hit.readCommand}`),
          '',
        )
      }
      return out.join('\n').trimEnd()
    }
  }
}

import { encode as encodeToon } from '@toon-format/toon'
import chalk from 'chalk'
import type { GuideListedTopic, GuideListingResult, GuideSearchHit } from '@specd/guide'
import { isGeneratedTopic } from '@specd/guide'
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
 * Structured pointer from `specd guide` to the sibling SDK guide.
 *
 * This is a structured field rather than a text footer so that agents can discover
 * the SDK guide without parsing prose.
 */
export interface GuideSdkDiscovery {
  /** Exact command name serving the SDK guide. */
  readonly command: string
  /** What the command provides. */
  readonly description: string
  /** Collections served by the SDK guide. */
  readonly collections: readonly string[]
}

/**
 * Extra members a caller adds to the shared listing envelope.
 */
export interface GuideListingEnvelopeExtras {
  /** Structured pointer to the sibling SDK guide. */
  readonly discovery?: GuideSdkDiscovery
  /** Exact command that reveals topics withheld by the active scope. */
  readonly revealCommand?: string
}

/**
 * Builds the structured listing envelope shared by both guide commands.
 *
 * Both `specd guide` and `specd guide-sdk` emit this same shape, so a caller learns
 * one structured contract for both catalogs instead of one per command.
 *
 * @param listing - The listing result carrying topics and their coordinates
 * @param extras - Optional discovery pointer and reveal command
 * @returns The envelope object
 */
export function buildGuideListingEnvelope(
  listing: GuideListingResult,
  extras: GuideListingEnvelopeExtras = {},
): Record<string, unknown> {
  const envelope: Record<string, unknown> = {
    topics: listing.topics,
    pagination: listing.pagination,
    collections: listing.collections,
  }
  if (listing.withheld !== undefined) {
    envelope.hiddenByDefault = {
      generatedApiTopics: listing.withheld.generatedTopics,
      ...(extras.revealCommand === undefined ? {} : { revealWith: extras.revealCommand }),
    }
  }
  if (extras.discovery !== undefined) {
    envelope.sdkGuide = extras.discovery
  }
  return envelope
}

/**
 * Formats a guide catalog listing for either guide command.
 *
 * Under `text` the entries of each collection are rendered as their own block, so a
 * page spanning several collections reads as several collections rather than one run
 * of entries. The page position is reported only when the result spans several pages.
 *
 * @param listing - The listing result to render
 * @param format - The output format to render
 * @param extras - Optional discovery pointer and reveal command
 * @returns The formatted string
 */
export function formatGuideListing(
  listing: GuideListingResult,
  format: GuideOutputFormat,
  extras: GuideListingEnvelopeExtras = {},
): string {
  if (format === 'json' || format === 'toon') {
    const envelope = buildGuideListingEnvelope(listing, extras)
    return format === 'json' ? JSON.stringify(envelope, null, 2) : encodeToon(envelope)
  }

  const blocks: string[] = []
  for (const extent of listing.collections) {
    const rows = listing.topics.filter((t) => t.collection === extent.collection)
    if (rows.length === 0) {
      continue
    }
    blocks.push(
      `${renderCollectionHeader(extent.collection, extent.total, extent.firstPage, extent.lastPage)}\n${renderTopicTable(rows)}`,
    )
  }

  const body =
    blocks.length === 0 ? 'No guide topics matched the requested scope.' : blocks.join('\n\n')
  const footers: string[] = []
  const pager = renderPagePosition(listing)
  if (pager !== undefined) {
    footers.push(pager)
  }
  if (listing.withheld !== undefined) {
    footers.push(renderWithheldNotice(listing.withheld.generatedTopics, extras.revealCommand))
  }
  if (extras.discovery !== undefined) {
    footers.push(renderSdkDiscovery(extras.discovery))
  }

  return footers.length === 0 ? body : `${body}\n${footers.join('\n')}`
}

/**
 * Renders a per-topic row set as a collection-qualified table.
 *
 * @param rows - Topics belonging to a single collection
 * @returns Rendered table
 */
function renderTopicTable(rows: readonly GuideListedTopic[]): string {
  const columns = [
    {
      header: 'TOPIC',
      width: Math.min(
        60,
        Math.max(
          20,
          colWidth(
            'TOPIC',
            rows.map((r) => `${r.collection}:${r.topic}`),
          ),
        ),
      ),
      overflow: 'truncate' as const,
    },
    {
      header: 'TITLE',
      width: Math.min(
        40,
        colWidth(
          'TITLE',
          rows.map((r) => r.title),
        ),
      ),
      overflow: 'truncate' as const,
    },
    {
      header: 'DESCRIPTION',
      width: Math.max(
        30,
        colWidth(
          'DESCRIPTION',
          rows.map((r) => r.description),
        ),
      ),
      overflow: 'wrap' as const,
    },
  ]

  return renderTable(
    null,
    columns,
    rows.map((r) => [`${r.collection}:${r.topic}`, r.title, r.description]),
  )
}

/**
 * Renders the header delimiting one collection's entries from the next collection's.
 *
 * @param collection - Collection identifier
 * @param total - Topics the collection contributes under the active scope
 * @param firstPage - First page holding this collection's topics
 * @param lastPage - Last page holding this collection's topics
 * @returns Header line
 */
function renderCollectionHeader(
  collection: string,
  total: number,
  firstPage: number,
  lastPage: number,
): string {
  const range = firstPage === lastPage ? `page ${firstPage}` : `pages ${firstPage}-${lastPage}`
  return chalk.bold(`── ${collection} · ${total} topics · ${range} ──`)
}

/**
 * Renders the page position, or nothing when the result fits in a single page.
 *
 * @param listing - The listing result
 * @returns Footer line, or undefined for a single-page result
 */
function renderPagePosition(listing: GuideListingResult): string | undefined {
  const { page, totalPages, returned, total } = listing.pagination
  if (totalPages <= 1) {
    return undefined
  }
  return `${chalk.bold(`page ${page} of ${totalPages}`)} · ${returned} of ${total} topics`
}

/**
 * Renders the notice reporting topics the active scope withholds.
 *
 * @param generatedTopics - Number of withheld generated API topics
 * @param revealCommand - Exact command that reveals them, when known
 * @returns Footer line
 */
function renderWithheldNotice(generatedTopics: number, revealCommand?: string): string {
  const reveal = revealCommand === undefined ? '' : ` · reveal with ${revealCommand}`
  return `${chalk.bold('hiddenByDefault:')} ${generatedTopics} generated API topics withheld${reveal}`
}

/**
 * Renders the SDK guide discovery pointer as a labelled block in text output.
 *
 * @param discovery - The SDK guide discovery payload
 * @returns Formatted discovery block
 */
export function renderSdkDiscovery(discovery: GuideSdkDiscovery): string {
  return [
    '',
    `${chalk.bold('sdkGuide:')}`,
    `  ${chalk.bold('command:')}     ${discovery.command}`,
    `  ${chalk.bold('description:')} ${discovery.description}`,
    `  ${chalk.bold('collections:')} ${discovery.collections.join(', ')}`,
  ].join('\n')
}

/**
 * One topic row in the catalog index.
 */
export interface GuideIndexEntry {
  /** Collection the topic belongs to */
  readonly collection: string
  /** Bare topic identifier */
  readonly topic: string
  /** Whether the topic is a hand-written document or a generated API topic */
  readonly scope: 'docs' | 'api'
  /** Human-readable title */
  readonly title: string
  /** Total document lines */
  readonly lines: number
  /** Document size in bytes */
  readonly bytes: number
  /** 1-indexed page the topic is returned on */
  readonly page: number
}

/**
 * Command wording served alongside the catalog index.
 */
export interface GuideIndexOptions {
  /** Exact command shape that reads a topic, shown once above the index. */
  readonly readHint: string
  /** Exact command that reveals topics withheld by the active scope. */
  readonly revealCommand?: string
}

/**
 * Formats the catalog index served by `--meta` without a topic argument.
 *
 * The index gives a caller the location of every topic rather than its content: the
 * per-collection extents make the collection boundaries visible, and each topic
 * carries the page it starts on and its size.
 *
 * The command that reads a topic is shown once above the index instead of repeated on
 * every row, because the shape is identical for each topic and repeating it costs one
 * string per topic without adding information. The hint names only `<topic>` because
 * the TOPIC cell already renders the collection-qualified identifier verbatim, so a
 * caller pastes that cell without composing anything.
 *
 * @param listing - The listing result to index
 * @param format - The output format to render
 * @param options - Command wording for reading a topic and revealing withheld topics
 * @returns The formatted index
 */
export function formatGuideIndex(
  listing: GuideListingResult,
  format: GuideOutputFormat,
  options: GuideIndexOptions,
): string {
  const entries: GuideIndexEntry[] = listing.topics.map((topic) => ({
    collection: topic.collection,
    topic: topic.topic,
    scope: topic.scope,
    title: topic.title,
    lines: topic.lineCount,
    bytes: topic.byteLength,
    page: topic.page,
  }))

  const envelope = {
    collections: listing.collections,
    pagination: listing.pagination,
    readHint: options.readHint,
    topics: entries,
    ...(listing.withheld === undefined
      ? {}
      : {
          hiddenByDefault: {
            generatedApiTopics: listing.withheld.generatedTopics,
            revealWith: options.revealCommand,
          },
        }),
  }

  if (format === 'json') {
    return JSON.stringify(envelope, null, 2)
  }
  if (format === 'toon') {
    return encodeToon(envelope)
  }

  const blocks = [
    `${chalk.bold('collections:')}\n${renderIndexCollections(listing.collections)}`,
    renderIndexTable(entries),
  ]
  const footer: string[] = []
  const pager = renderPagePosition(listing)
  if (pager !== undefined) {
    footer.push(pager)
  }
  if (listing.withheld !== undefined) {
    footer.push(renderWithheldNotice(listing.withheld.generatedTopics, options.revealCommand))
  }

  return `${chalk.bold('read:')} ${options.readHint}\n\n${blocks.join('\n\n')}${
    footer.length === 0 ? '' : `\n\n${footer.join('\n')}`
  }`
}

/**
 * Renders the per-collection extent block of the catalog index.
 *
 * @param collections - Per-collection extents
 * @returns Rendered block
 */
function renderIndexCollections(collections: readonly GuideCollectionExtentView[]): string {
  if (collections.length === 0) {
    return '  (no collections)'
  }
  const nameWidth = Math.max(
    11,
    colWidth(
      'COLLECTION',
      collections.map((c) => c.collection),
    ),
  )
  return collections
    .map((c) => {
      const range =
        c.firstPage === c.lastPage ? `page ${c.firstPage}` : `pages ${c.firstPage}-${c.lastPage}`
      return `  ${c.collection.padEnd(nameWidth)}  ${String(c.total).padStart(5)} topics  ${range}`
    })
    .join('\n')
}

/**
 * Structural view of a collection extent, used by the index renderer.
 */
export interface GuideCollectionExtentView {
  /** Collection identifier */
  readonly collection: string
  /** Topics the collection contributes under the active scope */
  readonly total: number
  /** First page holding this collection's topics */
  readonly firstPage: number
  /** Last page holding this collection's topics */
  readonly lastPage: number
}

/**
 * Renders the per-topic table of the catalog index.
 *
 * @param entries - Index entries
 * @returns Rendered table
 */
function renderIndexTable(entries: readonly GuideIndexEntry[]): string {
  if (entries.length === 0) {
    return 'No guide topics matched the requested scope.'
  }
  const columns = [
    { header: 'PAGE', width: 6 },
    { header: 'SCOPE', width: 5 },
    {
      header: 'TOPIC',
      width: Math.min(
        56,
        Math.max(
          20,
          colWidth(
            'TOPIC',
            entries.map((e) => `${e.collection}:${e.topic}`),
          ),
        ),
      ),
      overflow: 'truncate' as const,
    },
    { header: 'LINES', width: 7 },
    { header: 'BYTES', width: 8 },
    {
      header: 'TITLE',
      width: Math.min(
        40,
        colWidth(
          'TITLE',
          entries.map((e) => e.title),
        ),
      ),
      overflow: 'truncate' as const,
    },
  ]

  return renderTable(
    null,
    columns,
    entries.map((e) => [
      String(e.page),
      e.scope,
      `${e.collection}:${e.topic}`,
      String(e.lines),
      String(e.bytes),
      e.title,
    ]),
  )
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
  /** Collection the topic belongs to: the curated bundle it comes from */
  readonly collection?: string
  /** Whether the topic is a hand-written document or a generated API topic */
  readonly scope?: 'docs' | 'api'
  /**
   * Published package a generated API symbol is imported from.
   *
   * Present only on generated API topics, where it is the actionable counterpart to
   * `file`: the caller installs and imports this package, whereas `file` is a path
   * inside the specd repository that does not exist in the caller's own tree.
   */
  readonly packageName?: string
  /** Copy-pasteable import statement for a generated API symbol */
  readonly importStatement?: string
  /**
   * Path of a hand-written document, relative to its collection.
   *
   * Omitted for generated API topics. The declaration a generated symbol comes from lives
   * inside the specd repository and not in the caller's own tree, so the path cannot be
   * acted on and only points away from the package and import that do work.
   */
  readonly file?: string
  /** Human-readable title */
  readonly title?: string
  /** Concise description */
  readonly description?: string
  /** Navigation order */
  readonly order?: number
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
      // `scope` and `collection` are reported as separate fields because they are
      // separate dimensions: scope is the kind of document, collection is the curated
      // bundle it comes from. `packageName` and `importStatement` lead the block for
      // generated API topics because the import statement is what the caller can act on;
      // `file` is omitted there, since a declaration path inside the specd repository
      // does not exist in the caller's tree.
      const stats = [
        `${chalk.bold('topic:')} ${meta.topic}`,
        ...(meta.scope === undefined ? [] : [`${chalk.bold('scope:')} ${meta.scope}`]),
        ...(meta.collection === undefined
          ? []
          : [`${chalk.bold('collection:')} ${meta.collection}`]),
        ...(meta.packageName === undefined
          ? []
          : [`${chalk.bold('package:')} ${meta.packageName}`]),
        ...(meta.importStatement === undefined
          ? []
          : [`${chalk.bold('import:')}  ${meta.importStatement}`]),
        ...(meta.file === undefined ? [] : [`${chalk.bold('file:')}  ${meta.file}`]),
        ...(meta.title === undefined ? [] : [`${chalk.bold('title:')} ${meta.title}`]),
        ...(meta.description === undefined ? [] : [`${chalk.bold('desc:')}  ${meta.description}`]),
        ...(meta.order === undefined ? [] : [`${chalk.bold('order:')} ${meta.order}`]),
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
/**
 * Projects a search hit onto the shape the CLI publishes.
 *
 * A hit on a generated API topic withholds the declaration it was extracted from, for the same
 * reason the topic's own metadata withholds it: that path lives inside this repository and the
 * caller cannot open it, so naming it only invites an agent to look for a file that is not
 * there. A hit on a hand-written document keeps its path, which is the only thing telling the
 * reader where the content came from.
 *
 * @param hit - Hit reported by the search engine.
 * @returns The hit as published, without `file` when the topic is a generated one.
 */
function toPublicSearchHit(hit: GuideSearchHit): Omit<GuideSearchHit, 'file'> & {
  readonly file?: GuideSearchHit['file']
} {
  if (!isGeneratedTopic(hit.topic)) {
    return hit
  }
  // The published fields are listed rather than spread, because the key is being left out on
  // purpose: a field added to the model later has to be published or withheld deliberately
  // instead of leaking into the output by default. The engine keeps the real path either way.
  return {
    collection: hit.collection,
    topic: hit.topic,
    section: hit.section,
    sectionIndex: hit.sectionIndex,
    level: hit.level,
    startLine: hit.startLine,
    endLine: hit.endLine,
    score: hit.score,
    snippet: hit.snippet,
    readCommand: hit.readCommand,
  }
}

/**
 * Formats search results for the requested output format.
 *
 * @param hits - Hits reported by the search engine.
 * @param format - Output format.
 * @returns The formatted result set.
 */
export function formatGuideSearchHits(
  hits: readonly GuideSearchHit[],
  format: GuideOutputFormat,
): string {
  const published = hits.map(toPublicSearchHit)
  switch (format) {
    case 'json':
      return JSON.stringify(published, null, 2)
    case 'toon':
      return encodeToon(published)
    case 'text':
    default: {
      if (published.length === 0) {
        return 'No matching guide sections found.'
      }
      const out: string[] = []
      for (let i = 0; i < published.length; i++) {
        const hit = published[i]!
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

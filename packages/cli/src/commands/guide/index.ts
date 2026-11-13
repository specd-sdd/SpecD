import { Command } from 'commander'
import {
  createGuideEngine,
  GuideSectionAmbiguousError,
  GuideSectionNotFoundError,
  GuideTopicNotFoundError,
  isGeneratedTopic,
  type GuideEngine,
} from '@specd/guide'
import { SpecdCliError } from '../../errors/index.js'
import { cliError } from '../../handle-error.js'
import {
  assertTopicRequired,
  DEFAULT_PAGE_SIZE,
  resolveGuidePagination,
} from './listing-options.js'
import {
  formatGuideContent,
  formatGuideIndex,
  formatGuideListing,
  formatGuideMetadata,
  formatGuideSearchHits,
  parseGuideFormat,
  type GuideIndexOptions,
  type GuideOutputFormat,
  type GuideSdkDiscovery,
} from './formatters.js'

/**
 * Structured pointer from `specd guide` to the sibling SDK guide.
 *
 * It is emitted under every output format so that agents can discover the SDK guide
 * without scraping prose.
 */
const GUIDE_INDEX_OPTIONS: GuideIndexOptions = {
  readHint: 'specd guide <topic>',
}

const SDK_GUIDE_DISCOVERY: GuideSdkDiscovery = {
  command: 'specd guide-sdk',
  description:
    'SDK and extension development guide: package references and generated public API topics',
  collections: ['sdk', 'core', 'code-graph', 'skills', 'schemas'],
}

/**
 * Command line options for the main guide command.
 */
export interface GuideCommandOptions {
  readonly meta?: boolean
  readonly section?: string
  readonly startLine?: number
  readonly lines?: number
  readonly lineNumbers?: boolean
  readonly page?: number
  readonly pageSize?: number
  readonly format?: string
}

/**
 * Command line options for the guide search subcommand.
 */
export interface GuideSearchCommandOptions {
  readonly topic?: string
  readonly limit?: number
  readonly snippetLines?: number
  readonly format?: string
}

/**
 * Handles errors thrown during guide command execution and converts domain
 * errors into user-friendly CLI messages with exit code 1.
 *
 * @param err - The caught error
 * @param formatRaw - The raw format option string passed by the user
 */
function handleGuideError(err: unknown, formatRaw?: string): never {
  let format: GuideOutputFormat = 'text'
  try {
    format = parseGuideFormat(formatRaw, 'text')
  } catch {
    format = 'text'
  }

  if (err instanceof GuideTopicNotFoundError) {
    const detail =
      err.availableTopics.length > 0
        ? `Available topics: ${err.availableTopics.join(', ')}`
        : undefined
    cliError(
      `[UNKNOWN_GUIDE_TOPIC] ${err.message}`,
      format,
      1,
      'UNKNOWN_GUIDE_TOPIC',
      detail
        ? {
            detail,
            metadata:
              err.titleMatches.length > 0 ? { suggestedTopics: [...err.titleMatches] } : undefined,
          }
        : undefined,
    )
  }

  if (err instanceof GuideSectionNotFoundError) {
    const detail =
      err.availableHeadings.length > 0
        ? `Available sections in guide:\n  ${err.availableHeadings.join('\n  ')}`
        : undefined
    cliError(
      `[UNKNOWN_GUIDE_SECTION] ${err.message}`,
      format,
      1,
      'UNKNOWN_GUIDE_SECTION',
      detail ? { detail } : undefined,
    )
  }

  if (err instanceof GuideSectionAmbiguousError) {
    const suggestions = err.matchingIndices
      .map((idx) => `specd guide <topic> --section ${idx}`)
      .join(' or ')
    const detail = [
      'Matching sections:',
      ...err.matchingHeadings.map((h, i) => `  - [${err.matchingIndices[i]}] ${h}`),
      `Disambiguate with: ${suggestions}`,
    ].join('\n')

    cliError(`[AMBIGUOUS_GUIDE_SECTION] ${err.message}`, format, 1, 'AMBIGUOUS_GUIDE_SECTION', {
      detail,
    })
  }

  // CLI-level validation errors already carry their own machine-readable code.
  if (err instanceof SpecdCliError) {
    cliError(err.message, format, 1, err.code)
  }

  const message = err instanceof Error ? err.message : String(err)
  cliError(message, format, 1, 'GUIDE_ERROR')
}

/**
 * Registers the `guide` command and its subcommands with the Commander program.
 *
 * @param program - Commander program instance
 * @param engineOverride - Optional GuideEngine instance for unit testing
 */
export function registerGuideCommand(program: Command, engineOverride?: GuideEngine): void {
  const engine = engineOverride ?? createGuideEngine()

  const guideCmd = program
    .command('guide [topic]')
    .description(
      'Retrieve on-demand documentation topics, outline metadata, section slices, and search',
    )
    .option(
      '--meta',
      'Inspect document metadata and outline structure without full text; with no topic, print a catalog index',
    )
    .option('--page <n>', '1-indexed listing page to return', (val) => parseInt(val, 10), 1)
    .option(
      '--page-size <n>',
      'Maximum entries per listing page',
      (val) => parseInt(val, 10),
      DEFAULT_PAGE_SIZE,
    )
    .option(
      '--section <name|index>',
      'Extract a specific section by heading name, slug, or 1-indexed section number',
    )
    .option('--start-line <n>', '1-indexed start line number', (val) => parseInt(val, 10))
    .option('--lines <m>', 'Maximum number of lines to emit', (val) => parseInt(val, 10))
    .option('--line-numbers', 'Prefix each emitted line with its 1-indexed line number')
    .option('--format <format>', 'Output format: text|json|toon')
    .addHelpText(
      'after',
      [
        '',
        'This command serves the hand-written SpecD guide. The SDK and extension',
        'development guide — package references plus generated public API topics —',
        'is served by `specd guide-sdk`.',
        '',
        'Examples:',
        '  $ specd guide --meta',
        '  $ specd guide-cli/commands --section 2',
        '  $ specd guide search "delta lifecycle"',
        '  $ specd guide-sdk --scope api',
      ].join('\n'),
    )
    .action(async (topicArg: string | undefined, options: GuideCommandOptions) => {
      try {
        const format = parseGuideFormat(options.format, 'text')

        // 1. Catalog listing or catalog index: no topic specified
        if (!topicArg) {
          assertTopicRequired(options)
          const pagination = resolveGuidePagination(options.page, options.pageSize)
          const listing = await engine.listGuides({ pagination })
          const rendered = options.meta
            ? formatGuideIndex(listing, format, GUIDE_INDEX_OPTIONS)
            : formatGuideListing(listing, format, { discovery: SDK_GUIDE_DISCOVERY })
          process.stdout.write(`${rendered}\n`)
          return
        }

        const topic = topicArg.trim()

        // 2. Metadata and outline inspection
        if (options.meta) {
          const outline = await engine.getGuideOutline(topic)
          const outlineItems = (outline.sections ?? []).map((s) => ({
            index: s.index,
            heading: s.heading,
            level: s.level,
            startLine: s.startLine,
            endLine: s.endLine,
            lines: s.lines,
            startOffset: s.startOffset,
            endOffset: s.endOffset,
          }))
          const rendered = formatGuideMetadata(
            {
              topic: outline.topic,
              scope: isGeneratedTopic(outline.topic) ? 'api' : 'docs',
              collection: outline.collection,
              file: outline.file,
              lines: outline.lines,
              bytes: outline.bytes,
              outline: outlineItems,
            },
            format,
          )
          process.stdout.write(`${rendered}\n`)
          return
        }

        // 3. Section extraction
        if (options.section !== undefined) {
          const section = await engine.getGuideSection(topic, options.section)
          let content = section.content ?? ''

          if (options.startLine !== undefined || options.lines !== undefined) {
            content = engine.sliceGuideLines(content, options.startLine, options.lines)
          }

          if (options.lineNumbers) {
            content = engine.formatWithLineNumbers(content, section.startLine)
          }

          const rendered = formatGuideContent(topic, content, format)
          process.stdout.write(`${rendered}\n`)
          return
        }

        // 4. Full guide retrieval with optional line window
        const guide = await engine.getGuide(topic)
        let content = guide.content

        if (options.startLine !== undefined || options.lines !== undefined) {
          content = engine.sliceGuideLines(content, options.startLine, options.lines)
        }

        if (options.lineNumbers) {
          const baseLine =
            options.startLine !== undefined && options.startLine >= 1
              ? Math.floor(options.startLine)
              : 1
          content = engine.formatWithLineNumbers(content, baseLine)
        }

        const rendered = formatGuideContent(topic, content, format)
        process.stdout.write(`${rendered}\n`)
      } catch (err) {
        handleGuideError(err, options.format)
      }
    })

  guideCmd
    .command('search [query]')
    .description('Search indexed guide sections using BM25 full-text search')
    .option('--topic <topic>', 'Restrict search results to a specific topic')
    .option(
      '--limit <n>',
      'Maximum number of results to return (default: 5)',
      (val) => parseInt(val, 10),
      5,
    )
    .option(
      '--snippet-lines <n>',
      'Contextual lines before and after match (default: 3)',
      (val) => parseInt(val, 10),
      3,
    )
    .option('--format <format>', 'Output format: text|json|toon')
    .action(async (queryArg: unknown, options: unknown, command: unknown) => {
      try {
        const cmd = (command ?? options ?? queryArg) as {
          opts?: () => Record<string, unknown>
          parent?: { opts?: () => Record<string, unknown> }
        }
        const cmdOpts = typeof cmd?.opts === 'function' ? cmd.opts() : {}
        const parentOpts = typeof cmd?.parent?.opts === 'function' ? cmd.parent.opts() : {}

        const query = typeof queryArg === 'string' ? queryArg.trim() : ''
        const opts = (
          typeof options === 'object' && options !== null
            ? options
            : typeof queryArg === 'object' && queryArg !== null
              ? queryArg
              : {}
        ) as GuideSearchCommandOptions

        const formatRaw = (opts.format ?? cmdOpts['format'] ?? parentOpts['format']) as
          | string
          | undefined
        const format = parseGuideFormat(formatRaw, 'text')

        const limitVal = opts.limit ?? cmdOpts['limit'] ?? 5
        const limit =
          typeof limitVal === 'number'
            ? limitVal
            : typeof limitVal === 'string'
              ? parseInt(limitVal, 10)
              : 5

        const snippetLinesVal = opts.snippetLines ?? cmdOpts['snippetLines'] ?? 3
        const snippetLines =
          typeof snippetLinesVal === 'number'
            ? snippetLinesVal
            : typeof snippetLinesVal === 'string'
              ? parseInt(snippetLinesVal, 10)
              : 3

        const topic = (opts.topic ?? cmdOpts['topic']) as string | undefined

        if (!query) {
          const emptyHits = formatGuideSearchHits([], format)
          process.stdout.write(`${emptyHits}\n`)
          return
        }

        const hits = await engine.searchGuides(query, {
          topic,
          limit,
          snippetLines,
        })

        const rendered = formatGuideSearchHits(hits, format)
        process.stdout.write(`${rendered}\n`)
      } catch (err) {
        handleGuideError(
          err,
          options && typeof options === 'object' && 'format' in options
            ? String(options.format)
            : undefined,
        )
      }
    })
}

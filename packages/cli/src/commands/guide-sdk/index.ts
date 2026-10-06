import { Command } from 'commander'
import {
  GuideSectionAmbiguousError,
  GuideSectionNotFoundError,
  GuideTopicNotFoundError,
  isGeneratedTopic,
  type GuideEngine,
} from '@specd/guide'
import {
  InvalidGuideCollectionError,
  InvalidGuideScopeError,
  SpecdCliError,
} from '../../errors/index.js'
import { cliError } from '../../handle-error.js'
import { loadConfig } from '../../load-config.js'
import {
  assertTopicRequired,
  DEFAULT_PAGE_SIZE,
  resolveGuidePagination,
} from '../guide/listing-options.js'
import {
  formatGuideContent,
  formatGuideIndex,
  formatGuideListing,
  formatGuideMetadata,
  formatGuideSearchHits,
  parseGuideFormat,
  type GuideIndexOptions,
  type GuideOutputFormat,
} from '../guide/formatters.js'

/**
 * Command line options for the SDK guide command.
 */
export interface GuideSdkCommandOptions {
  readonly meta?: boolean
  readonly section?: string
  readonly startLine?: number
  readonly lines?: number
  readonly lineNumbers?: boolean
  readonly scope?: string
  readonly collection?: string
  readonly page?: number
  readonly pageSize?: number
  readonly format?: string
}

/**
 * Command line options for the SDK guide search subcommand.
 */
export interface GuideSdkSearchCommandOptions {
  readonly topic?: string
  readonly collection?: string
  readonly limit?: number
  readonly snippetLines?: number
  readonly format?: string
}

/**
 * Reserved scopes that select generated API topics across every collection.
 */
const SCOPE_API = 'api'

/**
 * Reserved scope that selects every topic in the catalog.
 */
const SCOPE_ALL = 'all'

/**
 * Reserved scope that selects only hand-written topics, matching the default.
 */
const SCOPE_DOCS = 'docs'

/**
 * Exact command that reveals the generated API topics withheld by the default scope.
 */
const REVEAL_API_COMMAND = 'specd guide-sdk --scope api'

/**
 * Exact command name serving this collection.
 */
const COMMAND = 'specd guide-sdk'

/**
 * Default number of search hits returned by one query.
 */
const DEFAULT_SEARCH_LIMIT = 5

/**
 * Default number of contextual lines emitted around a search match.
 */
const DEFAULT_SNIPPET_LINES = 3

/**
 * Builds the scope predicate for a `--scope` value.
 *
 * Scope answers only "which kinds of topics", and deliberately does not name a
 * collection: `docs` selects hand-written topics, `api` selects generated topics across
 * every collection, and `all` selects both. Restricting to one collection is the job of
 * `--collection`, which composes with any scope instead of competing with it.
 *
 * @param scope - Raw `--scope` value
 * @returns A scope predicate
 * @throws {InvalidGuideScopeError} When the scope is not a reserved scope value
 */
function resolveScope(scope: string | undefined): Record<string, unknown> {
  if (scope === undefined) {
    return { generated: false }
  }

  const normalized = scope.trim().toLowerCase()
  if (normalized.length === 0) {
    return { generated: false }
  }

  if (normalized === SCOPE_DOCS) {
    return { generated: false }
  }

  if (normalized === SCOPE_API) {
    return { generated: true }
  }

  if (normalized === SCOPE_ALL) {
    return {}
  }

  throw new InvalidGuideScopeError(
    `invalid scope '${scope}' — must be one of: ${SCOPE_DOCS}, ${SCOPE_API}, ${SCOPE_ALL}` +
      `; to restrict to a single collection use --collection <collection>`,
  )
}

/**
 * Builds the collection predicate for a `--collection` value.
 *
 * @param collection - Raw `--collection` value
 * @param collections - Collections the active catalog serves
 * @returns A collection predicate, empty when no collection was requested
 * @throws {InvalidGuideCollectionError} When the collection is not served by the catalog
 */
function resolveCollection(
  collection: string | undefined,
  collections: readonly string[],
): Record<string, unknown> {
  if (collection === undefined) {
    return {}
  }

  const normalized = collection.trim().toLowerCase()
  if (normalized.length === 0) {
    return {}
  }

  if (!collections.includes(normalized)) {
    throw new InvalidGuideCollectionError(
      `invalid collection '${collection}' — must be one of: ${[...collections].sort().join(', ')}`,
    )
  }

  return { collection: normalized }
}

/**
 * Builds the "how to find it" detail of an unknown-topic error.
 *
 * The suggestion, when there is one, already names the exact topic to read. This detail
 * covers the case where there is not one: it points at the catalog index and the search
 * command, so a caller that cannot guess the identifier still has a next action that does
 * not require enumerating the catalog into its own context.
 *
 * @param err - The unknown-topic error
 * @returns The detail block emitted on stderr
 */
function browseHint(err: GuideTopicNotFoundError): string {
  return [
    `${err.availableTopics.length} topics are registered; browse or search them:`,
    `  ${REVEAL_API_COMMAND}`,
    `  ${COMMAND} --meta`,
    `  ${COMMAND} search "<query>"`,
  ].join('\n')
}

/**
 * Handles errors thrown during the SDK guide command and converts domain errors into
 * user-friendly CLI messages with exit code 1.
 *
 * @param err - The caught error
 * @param formatRaw - The raw format option string passed by the user
 */
function handleGuideSdkError(err: unknown, formatRaw?: string): never {
  let format: GuideOutputFormat = 'text'
  try {
    format = parseGuideFormat(formatRaw, 'text')
  } catch {
    format = 'text'
  }

  if (err instanceof GuideTopicNotFoundError) {
    // The catalog registers more than a thousand topics, so the message names the one
    // identifier that fixes the request and this detail names the commands that browse
    // the catalog. Quoting a window of candidates instead would spend the caller's
    // context on names that mostly share nothing with the request: among several
    // hundred same-kind topics the window fills with alphabetically early entries that
    // are not candidates at all. The complete list stays in `metadata.availableTopics`
    // for callers that want to enumerate it themselves.
    const detail = err.availableTopics.length === 0 ? undefined : browseHint(err)
    const metadata: Record<string, unknown> = {
      availableTopics: [...err.availableTopics],
      availableTopicCount: err.availableTopics.length,
    }
    if (err.titleMatches.length > 0) {
      metadata.suggestedTopics = [...err.titleMatches]
      metadata.suggestionScope = err.crossCollection ? 'other-collection' : 'requested-collection'
    }
    cliError(
      `[UNKNOWN_GUIDE_TOPIC] ${err.message}`,
      format,
      1,
      'UNKNOWN_GUIDE_TOPIC',
      detail === undefined ? { metadata } : { detail, metadata },
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
      .map((idx) => `specd guide-sdk <topic> --section ${idx}`)
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
 * Registers the `guide-sdk` command and its search subcommand.
 *
 * The SDK engine is resolved lazily by the caller so that a `specd guide` invocation
 * never loads the generated SDK catalog.
 *
 * @param program - Commander program instance
 * @param resolveEngine - Async factory returning the SDK collection's engine
 */
export function registerGuideSdkCommand(
  program: Command,
  resolveEngine: () => Promise<GuideEngine>,
): void {
  const guideSdkCmd = program
    .command('guide-sdk [topic]')
    .description(
      'Retrieve SDK and extension development documentation, generated public API topics, and search',
    )
    .option(
      '--scope <scope>',
      'Select which kinds of topics: "docs" (hand-written, the default), "api" (generated only), or "all"',
    )
    .option(
      '--collection <name>',
      'Restrict the listing to a single collection; combines with --scope',
    )
    .option('--page <n>', '1-indexed listing page to return', (val) => parseInt(val, 10), 1)
    .option(
      '--page-size <n>',
      'Maximum entries per listing page',
      (val) => parseInt(val, 10),
      DEFAULT_PAGE_SIZE,
    )
    .option('--meta', 'Inspect document metadata and outline structure without full text')
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
        'The generated public API topics are excluded by default because they number in',
        'the thousands. Reveal them with `--scope api`, or combine them with the',
        'hand-written guide using `--scope all`.',
        '',
        '`--scope` selects topic kinds and `--collection` selects a collection, so the two',
        'compose: `--scope api --collection code-graph` lists only the generated code-graph',
        'topics.',
        '',
        'Examples:',
        '  $ specd guide-sdk --scope api',
        '  $ specd guide-sdk --meta',
        '  $ specd guide-sdk --collection core',
        '  $ specd guide-sdk --scope api --collection code-graph',
        '  $ specd guide-sdk core:examples/implementing-a-port --section 2',
        '  $ specd guide-sdk sdk:classes/ArtifactDag --meta',
        '  $ specd guide-sdk search "dependency tracking" --collection code-graph',
        '',
        'JSON/TOON output schema:',
        '  listing: { topics, pagination, collections, hiddenByDefault? }',
        '  metadata: { topic, collection, scope, title, description, order, lines, bytes, outline, packageName?, importStatement?, file? }',
        '  search: [{ collection, topic, section, sectionIndex, level, startLine, endLine, score, snippet, readCommand, file? }]',
        '  error: { result: "error", code, message, exitCode, metadata? }',
      ].join('\n'),
    )
    .action(async (topicArg: string | undefined, options: GuideSdkCommandOptions) => {
      try {
        await loadConfig({ configPath: guideSdkCmd.optsWithGlobals().config as string | undefined })
        if (topicArg === undefined || topicArg.trim().length === 0) {
          assertTopicRequired(options)
          await runListing(await resolveEngine(), options)
          return
        }

        await runTopic(await resolveEngine(), topicArg.trim(), options)
      } catch (err) {
        handleGuideSdkError(err, options.format)
      }
    })

  guideSdkCmd
    .command('search [query]')
    .description('Search indexed SDK guide sections using BM25 full-text search')
    .option('--topic <topic>', 'Restrict search results to specific topics')
    .option('--collection <name>', 'Restrict search results to a single collection')
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
      // Commander passes the parsed arguments, the option values, and the command. A
      // trailing `--format` is claimed by the parent `guide-sdk` command because it also
      // declares that option, so the subcommand's own values are merged over the
      // parent's before anything is read.
      const cmdOpts = {
        ...readCommandOptions((command as { parent?: unknown } | null)?.parent, undefined),
        ...readCommandOptions(command, options),
      }
      const formatRaw = cmdOpts['format']
      const format = parseGuideFormat(typeof formatRaw === 'string' ? formatRaw : undefined, 'text')

      try {
        await loadConfig({ configPath: guideSdkCmd.optsWithGlobals().config as string | undefined })
        const query = typeof queryArg === 'string' ? queryArg.trim() : ''

        if (query.length === 0) {
          process.stdout.write(`${formatGuideSearchHits([], format)}\n`)
          return
        }

        const collection = readStringOption(cmdOpts, 'collection')
        const hits = await (
          await resolveEngine()
        ).searchGuides(query, {
          topic: readStringOption(cmdOpts, 'topic'),
          ...(collection === undefined ? {} : { collections: [collection] }),
          limit: readPositiveIntOption(cmdOpts, 'limit', DEFAULT_SEARCH_LIMIT),
          snippetLines: readNonNegativeIntOption(cmdOpts, 'snippetLines', DEFAULT_SNIPPET_LINES),
        })

        process.stdout.write(`${formatGuideSearchHits(hits, format)}\n`)
      } catch (err) {
        handleGuideSdkError(err, typeof formatRaw === 'string' ? formatRaw : undefined)
      }
    })
}

/**
 * Reads parsed option values from a Commander command, falling back to the option bag
 * passed alongside the action arguments.
 *
 * @param command - The third action argument Commander supplies.
 * @param options - The second action argument Commander supplies.
 * @returns A map of option values, empty when neither source carries any.
 */
function readCommandOptions(command: unknown, options: unknown): Record<string, unknown> {
  if (command !== null && typeof command === 'object' && 'opts' in command) {
    const opts = (command as { opts?: () => Record<string, unknown> }).opts
    if (typeof opts === 'function') {
      return opts.call(command)
    }
  }

  return options !== null && typeof options === 'object' ? (options as Record<string, unknown>) : {}
}

/**
 * Reads a string option value.
 *
 * @param options - Parsed option values.
 * @param key - Option name in camelCase.
 * @returns The trimmed string value, or undefined when absent or blank.
 */
function readStringOption(options: Record<string, unknown>, key: string): string | undefined {
  const value = options[key]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/**
 * Reads an integer option value, coercing numeric strings and discarding non-positive values.
 *
 * @param options - Parsed option values.
 * @param key - Option name in camelCase.
 * @param fallback - Value used when the option is absent or unusable.
 * @returns The resolved positive integer.
 */
function readPositiveIntOption(
  options: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = options[key]
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback
}

/**
 * Reads a non-negative integer option value.
 *
 * @param options - Parsed option values.
 * @param key - Option name in camelCase.
 * @param fallback - Value used when the option is absent or unusable.
 * @returns The resolved non-negative integer.
 */
function readNonNegativeIntOption(
  options: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const value = options[key]
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : fallback
}

/**
 * Renders the bounded SDK catalog listing, or the catalog index under `--meta`.
 *
 * Both paths resolve `--scope` and `--collection` against the collections this catalog
 * actually serves, so a mistyped value fails instead of returning an empty page. The two
 * filters are merged into one scope record, which is why they compose without either
 * one shadowing the other.
 *
 * @param engine - The SDK collection engine
 * @param options - Parsed command options
 */
async function runListing(engine: GuideEngine, options: GuideSdkCommandOptions): Promise<void> {
  const format = parseGuideFormat(options.format, 'text')
  const collections = await engine.getCollections()
  const scope = {
    ...resolveScope(options.scope),
    ...resolveCollection(options.collection, collections),
  }
  const pagination = resolveGuidePagination(options.page, options.pageSize)

  const listing = await engine.listGuides({ scope, pagination })

  const rendered = options.meta
    ? formatGuideIndex(listing, format, INDEX_OPTIONS)
    : formatGuideListing(listing, format, { revealCommand: REVEAL_API_COMMAND })

  process.stdout.write(`${rendered}\n`)
}

/**
 * Exact command shape that reads one SDK topic.
 *
 * Shown once above the catalog index rather than repeated on every row, because the
 * shape is identical for every topic.
 */
const INDEX_OPTIONS: GuideIndexOptions = {
  readHint: `${COMMAND} <topic>`,
  revealCommand: REVEAL_API_COMMAND,
}

/**
 * Renders a single SDK topic, its metadata, or one of its sections.
 *
 * @param engine - The SDK collection engine
 * @param topic - Raw topic argument as supplied by the caller
 * @param options - Parsed command options
 */
async function runTopic(
  engine: GuideEngine,
  topic: string,
  options: GuideSdkCommandOptions,
): Promise<void> {
  const format = parseGuideFormat(options.format, 'text')

  if (options.meta) {
    const guide = await engine.getGuide(topic)
    const outline = await engine.getGuideOutline(topic)
    const generated = isGeneratedTopic(outline.topic)
    const rendered = formatGuideMetadata(
      {
        topic: outline.topic,
        scope: generated ? 'api' : 'docs',
        collection: outline.collection,
        // Generated API topics carry the published package and its import statement;
        // hand-written documents do not, so the keys are omitted rather than sent as
        // null under `exactOptionalPropertyTypes`.
        ...(outline.packageName === undefined ? {} : { packageName: outline.packageName }),
        ...(outline.importStatement === undefined
          ? {}
          : { importStatement: outline.importStatement }),
        // The declaration behind a generated symbol lives inside the specd repository, not
        // in the caller's tree, so its path is left out instead of naming a location the
        // caller cannot open.
        ...(generated ? {} : { file: outline.file }),
        lines: outline.lines,
        bytes: outline.bytes,
        title: guide.title,
        description: guide.description,
        order: guide.order,
        outline: (outline.sections ?? []).map((s) => ({
          index: s.index,
          heading: s.heading,
          level: s.level,
          startLine: s.startLine,
          endLine: s.endLine,
          lines: s.lines,
          startOffset: s.startOffset,
          endOffset: s.endOffset,
        })),
      },
      format,
    )
    process.stdout.write(`${rendered}\n`)
    return
  }

  if (options.section !== undefined) {
    const section = await engine.getGuideSection(topic, options.section)
    let content = section.content ?? ''

    if (options.startLine !== undefined || options.lines !== undefined) {
      content = engine.sliceGuideLines(content, options.startLine, options.lines)
    }

    if (options.lineNumbers) {
      content = engine.formatWithLineNumbers(content, section.startLine)
    }

    process.stdout.write(`${formatGuideContent(topic, content, format)}\n`)
    return
  }

  const guide = await engine.getGuide(topic)
  let content = guide.content

  if (options.startLine !== undefined || options.lines !== undefined) {
    content = engine.sliceGuideLines(content, options.startLine, options.lines)
  }

  if (options.lineNumbers) {
    const baseLine =
      options.startLine !== undefined && options.startLine >= 1 ? Math.floor(options.startLine) : 1
    content = engine.formatWithLineNumbers(content, baseLine)
  }

  process.stdout.write(`${formatGuideContent(topic, content, format)}\n`)
}

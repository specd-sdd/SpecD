import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from '../helpers.js'
import { registerGuideSdkCommand } from '../../../src/commands/guide-sdk/index.js'
import { createGuideSdkEngine, type GuideEngine } from '@specd/guide/sdk'

/**
 * Parses a captured stdout payload under the requested structured format.
 */
function parseStructured(out: string, format: 'json' | 'toon'): unknown {
  return format === 'json' ? JSON.parse(out) : out
}

/**
 * Shape of the structured listing envelope shared by both guide commands.
 */
interface ListingEnvelope {
  topics?: Array<Record<string, unknown>>
  pagination?: {
    page: number
    pageSize: number
    returned: number
    total: number
    totalPages: number
  }
  collections?: Array<{
    collection: string
    total: number
    firstPage: number
    lastPage: number
  }>
  hiddenByDefault?: { generatedApiTopics: number; revealWith?: string }
  /** Present instead of a listing when the command rejects its input */
  result?: string
  code?: string
  message?: string
}

/**
 * Parses a captured listing payload into its envelope.
 *
 * @param out - Captured stdout
 * @param format - Structured format the payload was rendered with
 * @returns The parsed envelope
 */
function parseListing(out: string, format: 'json' | 'toon'): ListingEnvelope {
  const payload = parseStructured(out, format)
  return (typeof payload === 'string' ? {} : payload) as ListingEnvelope
}

/**
 * Registers the SDK command against the real SDK collection engine.
 *
 * These tests exercise the shipped generated catalog rather than a stub, because the
 * behaviors under test (default scope, collection scoping, generated-topic addressing)
 * depend on real catalog content.
 */
function makeSdkProgram(
  engine: GuideEngine = createGuideSdkEngine(),
): ReturnType<typeof makeProgram> {
  const program = makeProgram()
  registerGuideSdkCommand(program, async () => engine)
  return program
}

describe('CLI guide-sdk command', () => {
  beforeEach(() => {
    mockProcessExit()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('catalog listing', () => {
    it('omits generated API topics from the unscoped listing', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', '--format', 'json'], { from: 'user' })

      const entries = parseListing(getStdout(), 'json').topics ?? []
      expect(entries.length).toBeGreaterThan(0)

      const generatedDirectories = [
        'classes/',
        'enumerations/',
        'functions/',
        'interfaces/',
        'types/',
        'variables/',
      ]
      const generated = entries.filter((e) =>
        generatedDirectories.some((dir) => String(e.topic).startsWith(dir)),
      )
      expect(generated).toHaveLength(0)
    })

    it('reports the withheld generated topics and how to reveal them', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', '--format', 'json'], { from: 'user' })

      const envelope = parseListing(getStdout(), 'json')
      // 21 hand-written SDK documents; the catalog also holds 1298 generated topics.
      expect(envelope.pagination?.total).toBe(21)
      expect(envelope.hiddenByDefault?.generatedApiTopics).toBe(1298)
      expect(envelope.hiddenByDefault?.revealWith).toBe('specd guide-sdk --scope api')
    })

    it('keeps the unscoped listing comparable in size to the user guide catalog', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', '--format', 'json'], { from: 'user' })

      expect((parseListing(getStdout(), 'json').topics ?? []).length).toBeLessThan(50)
    })

    it('returns only the requested collection for --collection', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--collection', 'core', '--page-size', '200', '--format', 'json'],
        { from: 'user' },
      )

      const entries = parseListing(getStdout(), 'json').topics ?? []
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every((e) => e.collection === 'core')).toBe(true)
    })

    it('composes --collection with --scope api to narrow generated topics', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        [
          'guide-sdk',
          '--scope',
          'api',
          '--collection',
          'code-graph',
          '--page-size',
          '200',
          '--format',
          'json',
        ],
        { from: 'user' },
      )

      const entries = parseListing(getStdout(), 'json').topics ?? []
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every((e) => e.collection === 'code-graph')).toBe(true)
      expect(entries.every((e) => e.scope === 'api')).toBe(true)
    })

    it('excludes generated topics when --collection is combined with --scope docs', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        [
          'guide-sdk',
          '--scope',
          'docs',
          '--collection',
          'core',
          '--page-size',
          '200',
          '--format',
          'json',
        ],
        { from: 'user' },
      )

      const entries = parseListing(getStdout(), 'json').topics ?? []
      expect(entries.length).toBeGreaterThan(0)
      expect(entries.every((e) => e.collection === 'core')).toBe(true)
      expect(entries.some((e) => e.scope === 'api')).toBe(false)
    })

    it('treats --scope docs as the default scope', async () => {
      const implicit = captureStdout()
      await makeSdkProgram().parseAsync(['guide-sdk', '--page-size', '2000', '--format', 'json'], {
        from: 'user',
      })
      const explicitOut = captureStdout()
      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'docs', '--page-size', '2000', '--format', 'json'],
        { from: 'user' },
      )

      const implicitTopics = parseListing(implicit(), 'json').topics ?? []
      const explicitTopics = parseListing(explicitOut(), 'json').topics ?? []
      expect(explicitTopics).toHaveLength(implicitTopics.length)
      expect(explicitTopics.some((e) => e.scope === 'api')).toBe(false)
    })

    it('rejects a collection passed to --scope and points at --collection', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', '--scope', 'core', '--format', 'json'], {
          from: 'user',
        }),
      ).rejects.toThrow(ExitSentinel)

      const envelope = parseListing(getStdout(), 'json')
      expect(envelope.result).toBe('error')
      expect(envelope.code).toBe('INVALID_GUIDE_SCOPE')
      expect(envelope.message).toContain('docs, api, all')
      expect(envelope.message).toContain('--collection')
    })

    it('rejects an unknown --collection with INVALID_GUIDE_COLLECTION', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', '--collection', 'nope', '--format', 'json'], {
          from: 'user',
        }),
      ).rejects.toThrow(ExitSentinel)

      const envelope = parseListing(getStdout(), 'json')
      expect(envelope.result).toBe('error')
      expect(envelope.code).toBe('INVALID_GUIDE_COLLECTION')
      expect(envelope.message).toContain('code-graph')
    })

    it('carries collection, topic, title, description, and order on every entry', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        [
          'guide-sdk',
          '--scope',
          'api',
          '--collection',
          'core',
          '--page-size',
          '5',
          '--format',
          'json',
        ],
        { from: 'user' },
      )

      const entries = parseListing(getStdout(), 'json').topics ?? []
      expect(entries).toHaveLength(5)
      for (const entry of entries) {
        expect(entry).toHaveProperty('collection', 'core')
        expect(typeof entry.topic).toBe('string')
        expect(typeof entry.title).toBe('string')
        expect(typeof entry.description).toBe('string')
        expect(typeof entry.order).toBe('number')
        expect(typeof entry.page).toBe('number')
        expect(entry.scope).toBe('api')
      }
    })

    it('orders entries by order then topic', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--collection', 'core', '--page-size', '200', '--format', 'json'],
        { from: 'user' },
      )

      const entries = (parseListing(getStdout(), 'json').topics ?? []) as Array<{
        order: number
        topic: string
      }>
      for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1]!
        const cur = entries[i]!
        expect(cur.order).toBeGreaterThanOrEqual(prev.order)
        if (cur.order === prev.order) {
          expect(
            cur.topic.localeCompare(prev.topic),
            `"${cur.topic}" must sort after "${prev.topic}"`,
          ).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it('never defines ordering across collections', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--collection', 'schemas', '--page-size', '200', '--format', 'json'],
        { from: 'user' },
      )

      const schemas = parseListing(getStdout(), 'json').topics ?? []
      expect(schemas.every((e) => e.collection === 'schemas')).toBe(true)

      // The schemas collection contains entries at order 1 and order 4; the presence of
      // the far larger core collection must not change their relative order.
      const topics = schemas.map((e) => String(e.topic))
      expect(topics.indexOf('schema-format')).toBeGreaterThanOrEqual(0)
      expect(topics.indexOf('examples/full-schema')).toBeGreaterThan(
        topics.indexOf('schema-format'),
      )
    })

    it('bounds the listing by the default page size', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'all', '--collection', 'core', '--format', 'json'],
        { from: 'user' },
      )

      const envelope = parseListing(getStdout(), 'json')
      expect(envelope.topics).toHaveLength(50)
      expect(envelope.pagination?.pageSize).toBe(50)
    })

    it('returns the requested page and preserves relative order', async () => {
      const all = captureStdout()
      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--collection', 'core', '--page-size', '2000', '--format', 'json'],
        { from: 'user' },
      )
      const full = (parseListing(all(), 'json').topics ?? []).map((e) => e.topic)

      const paged = captureStdout()
      await makeSdkProgram().parseAsync(
        [
          'guide-sdk',
          '--collection',
          'core',
          '--page-size',
          '5',
          '--page',
          '2',
          '--format',
          'json',
        ],
        { from: 'user' },
      )
      const envelope = parseListing(paged(), 'json')
      const page = (envelope.topics ?? []).map((e) => e.topic)

      expect(page).toEqual(full.slice(5, 10))
      expect(envelope.pagination?.page).toBe(2)
      expect(envelope.pagination?.returned).toBe(5)
      expect(envelope.pagination?.totalPages).toBe(Math.ceil(full.length / 5))
      expect(envelope.topics?.every((e) => e.page === 2)).toBe(true)
    })

    it('lists generated API topics only for --scope api', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'api', '--page-size', '10', '--format', 'json'],
        { from: 'user' },
      )

      const envelope = parseListing(getStdout(), 'json')
      const entries = envelope.topics ?? []
      expect(entries).toHaveLength(10)
      expect(entries.every((e) => String(e.topic).includes('/'))).toBe(true)
      // `--scope api` selects generated topics across every collection, not one.
      expect(envelope.pagination?.total).toBe(1298)
      expect((envelope.collections ?? []).map((c) => c.collection).sort()).toEqual([
        'code-graph',
        'core',
        'sdk',
      ])
      // Nothing is withheld once the generated topics are requested explicitly.
      expect(envelope.hiddenByDefault).toBeUndefined()
    })

    it('includes hand-written and generated topics for --scope all', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'all', '--page-size', '2000', '--format', 'json'],
        { from: 'user' },
      )

      const envelope = parseListing(getStdout(), 'json')
      expect(envelope.pagination?.total).toBe(1319)
      expect(envelope.hiddenByDefault).toBeUndefined()
    })

    it('reports the page position and the collection extents on every collection', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'api', '--page-size', '100', '--format', 'json'],
        { from: 'user' },
      )

      const envelope = parseListing(getStdout(), 'json')
      const collections = envelope.collections ?? []
      expect(collections.length).toBeGreaterThan(1)
      // Collections are contiguous, so each starts after the previous one ends.
      collections.forEach((extent, index) => {
        const previous = collections[index - 1]
        if (previous !== undefined) {
          expect(extent.firstPage).toBeGreaterThanOrEqual(previous.lastPage)
        }
        expect(extent.lastPage).toBeGreaterThanOrEqual(extent.firstPage)
        expect(extent.total).toBeGreaterThan(0)
      })
      expect(collections[collections.length - 1]?.lastPage).toBe(envelope.pagination?.totalPages)
    })

    it('rejects an unknown --scope with INVALID_GUIDE_SCOPE', async () => {
      const getStdout = captureStdout()
      const getStderr = captureStderr()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', '--scope', 'nope', '--format', 'json'], {
          from: 'user',
        }),
      ).rejects.toThrow(ExitSentinel)

      expect(getStderr()).toContain("invalid scope 'nope'")
      expect(JSON.parse(getStdout().trim())).toMatchObject({
        code: 'INVALID_GUIDE_SCOPE',
        exitCode: 1,
      })
    })

    it('names the valid scopes for an unknown --scope', async () => {
      const getStderr = captureStderr()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', '--scope', 'nope'], { from: 'user' }),
      ).rejects.toThrow(ExitSentinel)

      const stderr = getStderr()
      for (const scope of ['docs', 'api', 'all']) {
        expect(stderr).toContain(scope)
      }
    })

    it('renders a readable table with collection-qualified topics in text format', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', '--collection', 'core', '--page-size', '3'], {
        from: 'user',
      })

      const out = getStdout()
      expect(out).toContain('TOPIC')
      expect(out).toContain('TITLE')
      expect(out).toContain('core:')
    })

    it('delimits each collection and reports the page position in text format', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'api', '--page-size', '700', '--format', 'text'],
        { from: 'user' },
      )

      const out = getStdout()
      // Each collection is introduced by its own header instead of one run of entries.
      expect(out).toContain('── code-graph · 163 topics · page 1 ──')
      expect(out).toContain('── core · 535 topics · page 1 ──')
      expect(out).toContain('── sdk · 600 topics · pages 1-2 ──')
      expect(out).toContain('page 1 of 2 · 700 of 1298 topics')
    })

    it('omits the page position when the result fits in a single page', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'all', '--page-size', '2000', '--format', 'text'],
        { from: 'user' },
      )

      expect(getStdout()).not.toMatch(/page \d+ of \d+/)
    })

    it('reports the withheld generated topics in text format', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', '--format', 'text'], { from: 'user' })

      expect(getStdout()).toContain('hiddenByDefault:')
      expect(getStdout()).toContain('specd guide-sdk --scope api')
    })

    it('emits the shared listing envelope under json and toon', async () => {
      for (const format of ['json', 'toon'] as const) {
        const getStdout = captureStdout()
        await makeSdkProgram().parseAsync(
          ['guide-sdk', '--collection', 'core', '--page-size', '3', '--format', format],
          { from: 'user' },
        )
        const payload = parseStructured(getStdout(), format)
        if (format === 'json') {
          expect(payload).toMatchObject({
            pagination: { page: 1, pageSize: 3, returned: 3 },
          })
          expect((payload as ListingEnvelope).topics).toHaveLength(3)
        } else {
          // TOON encodes the envelope keys as named fields.
          expect(typeof payload).toBe('string')
          expect(payload as string).toContain('topics[')
          expect(payload as string).toContain('pagination:')
          expect(payload as string).toContain('collections[')
        }
      }
    })

    it('rejects --section, --start-line, and --lines without a topic', async () => {
      for (const flag of [
        ['--section', '2'],
        ['--start-line', '3'],
        ['--lines', '5'],
      ]) {
        const getStderr = captureStderr()
        await expect(
          makeSdkProgram().parseAsync(['guide-sdk', ...flag, '--format', 'json'], {
            from: 'user',
          }),
        ).rejects.toThrow(ExitSentinel)

        expect(getStderr()).toContain(`${flag[0]} requires a <topic> argument`)
        // No listing is rendered, because that would silently discard the request.
        expect(getStderr()).not.toContain('TOPIC')
      }
    })

    it('states in the catalog index that API topics exist and how to reveal them', async () => {
      const text = captureStdout()
      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--meta', '--page-size', '3', '--format', 'text'],
        { from: 'user' },
      )
      const out = text()
      expect(out).toContain('hiddenByDefault: 1298 generated API topics withheld')
      expect(out).toContain('reveal with specd guide-sdk --scope api')

      const structured = captureStdout()
      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--meta', '--page-size', '3', '--format', 'json'],
        { from: 'user' },
      )
      expect(parseListing(structured(), 'json').hiddenByDefault).toEqual({
        generatedApiTopics: 1298,
        revealWith: 'specd guide-sdk --scope api',
      })
    })

    it('declares the scope of every topic and states the read shape once', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'api', '--page-size', '3', '--meta', '--format', 'json'],
        { from: 'user' },
      )

      const payload = JSON.parse(getStdout()) as {
        readHint: string
        topics: Array<Record<string, unknown>>
      }
      expect(payload.readHint).toBe('specd guide-sdk <topic>')
      expect(payload.topics).toHaveLength(3)
      // Generated entries declare `api` so the caller need not read the path.
      expect(payload.topics.every((t) => t['scope'] === 'api')).toBe(true)
      // The read shape is stated once for the whole index, not per topic.
      expect(payload.topics.every((t) => t['readCommand'] === undefined)).toBe(true)

      const text = captureStdout()
      await makeSdkProgram().parseAsync(
        ['guide-sdk', '--scope', 'api', '--page-size', '3', '--meta'],
        { from: 'user' },
      )
      expect(text().match(/read: specd guide-sdk <topic>/g)).toHaveLength(1)
    })

    it('documents how the generated API topics are revealed in --help', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', '--help'], { from: 'user' }),
      ).rejects.toThrow()

      const help = getStdout()
      expect(help).toContain('--scope api')
      expect(help).toContain('specd guide-sdk --scope api')
      expect(help).toContain('specd guide-sdk sdk:classes/ArtifactDag --meta')
      expect(help).not.toContain('sdk:interfaces/ArtifactDag')
      expect(help).toContain('JSON/TOON output schema:')
      expect(help).toContain('listing: { topics, pagination, collections, hiddenByDefault? }')
      expect(help).toContain('metadata: { topic, collection, scope')
      expect(help).toContain('search: [{ collection, topic, section')
      expect(help).toContain('error: { result: "error", code, message, exitCode, metadata? }')
    })

    it('documents --collection as composable with --scope', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', '--help'], { from: 'user' }),
      ).rejects.toThrow()

      const help = getStdout()
      expect(help).toContain('--collection <name>')
      expect(help).toContain('specd guide-sdk --scope api --collection code-graph')
    })
  })

  describe('topic inspection', () => {
    it('resolves a collection-qualified topic', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:ports'], { from: 'user' })

      expect(getStdout()).toContain('# Ports')
    })

    it('preserves the path separator inside a topic', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:examples/implementing-a-port'], {
        from: 'user',
      })

      expect(getStdout()).toContain('# Example: Implementing a port')
    })

    it('addresses a generated API symbol individually', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'sdk:interfaces/Kernel'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('# Kernel')
      expect(out).toContain('## Signature')
      // A caller reaches the declaration through the published package, not through its
      // filesystem location, so the body points at the import instead of naming a file.
      expect(out).toContain('Import: `import type { Kernel } from')
      expect(out).not.toContain('Declared in')
    })

    it('trims surrounding whitespace before resolution', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', '  core:ports  '], { from: 'user' })

      expect(getStdout()).toContain('# Ports')
    })

    it('strips a trailing .md extension before resolution', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:ports.md'], { from: 'user' })

      expect(getStdout()).toContain('# Ports')
    })

    it('points at the browsing commands instead of listing topics for an unknown one', async () => {
      captureStdout()
      const getStderr = captureStderr()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'core:prot'], { from: 'user' }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      const err = getStderr()
      expect(err).toMatch(/^\d+ topics are registered;[\s\S]*\nerror: \[UNKNOWN_GUIDE_TOPIC\]/)
      expect(err).not.toContain('Guide error:')
      expect(err).toContain('UNKNOWN_GUIDE_TOPIC')
      // 1319 topics exist, so the detail teaches the two commands that can find them
      // instead of pasting a truncated window that answers neither.
      expect(err).toContain('specd guide-sdk --scope api')
      expect(err).toContain('specd guide-sdk --meta')
      expect(err).toContain('specd guide-sdk search "<query>"')
      // The topic list belongs to the structured payload, not to stderr.
      expect(err).not.toContain('Available topics:')
      expect(err).not.toContain('use --collection')
      expect(err).not.toContain('core:ports')
    })

    it('reports a short count of how many topics to browse', async () => {
      captureStdout()
      const getStderr = captureStderr()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'core:prot'], { from: 'user' }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      expect(getStderr()).toMatch(/\d+ topics are registered/)
    })

    it('returns the complete candidate list as structured metadata for JSON callers', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'core:prot', '--format', 'json'], {
          from: 'user',
        }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      const payload = JSON.parse(getStdout()) as {
        code: string
        metadata: { availableTopics: string[]; availableTopicCount: number }
      }
      expect(payload.code).toBe('UNKNOWN_GUIDE_TOPIC')
      expect(payload.metadata.availableTopics[0]).toBe('core:ports')
      expect(payload.metadata.availableTopicCount).toBe(payload.metadata.availableTopics.length)
    })

    it('names the canonical topic when the request matches a title exactly', async () => {
      captureStdout()
      const getStderr = captureStderr()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'GetGraphHealth'], { from: 'user' }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      // A generated topic's identifier carries its reflection kind, so a caller who knows
      // only the symbol name has no topic to type. The suggestion is the way out.
      const err = getStderr()
      expect(err).toContain('UNKNOWN_GUIDE_TOPIC')
      expect(err).toContain(
        "A topic titled 'GetGraphHealth' exists: code-graph:classes/GetGraphHealth",
      )
    })

    it('exposes title-matched suggestions as structured metadata for JSON callers', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'GetGraphHealth', '--format', 'json'], {
          from: 'user',
        }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      const payload = JSON.parse(getStdout()) as {
        code: string
        metadata: {
          suggestedTopics: string[]
          availableTopics: string[]
          availableTopicCount: number
        }
      }
      expect(payload.code).toBe('UNKNOWN_GUIDE_TOPIC')
      expect(payload.metadata.suggestedTopics).toEqual(['code-graph:classes/GetGraphHealth'])
      // The suggestion leads the candidate list so it survives the bounded window.
      expect(payload.metadata.availableTopics[0]).toBe('code-graph:classes/GetGraphHealth')
    })

    it('omits suggestedTopics when no title matches the request', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'core:prot', '--format', 'json'], {
          from: 'user',
        }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      const payload = JSON.parse(getStdout()) as { metadata: Record<string, unknown> }
      expect(payload.metadata.suggestedTopics).toBeUndefined()
    })

    it('says a title match came from another collection without resolving it', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(
          ['guide-sdk', 'sdk:classes/BulkSessionStateError', '--format', 'json'],
          { from: 'user' },
        ),
      ).rejects.toBeInstanceOf(ExitSentinel)

      const payload = JSON.parse(getStdout()) as {
        code: string
        metadata: { suggestedTopics: string[]; suggestionScope: string }
      }
      // The request named a collection that does not own the symbol. Reporting the topic is
      // the fix; quietly serving it from another collection would make the collection in the
      // request meaningless.
      expect(payload.code).toBe('UNKNOWN_GUIDE_TOPIC')
      expect(payload.metadata.suggestedTopics).toEqual(['code-graph:classes/BulkSessionStateError'])
      expect(payload.metadata.suggestionScope).toBe('other-collection')
    })

    it('marks a title match inside the requested collection', async () => {
      const getStdout = captureStdout()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'BulkSessionStateError', '--format', 'json'], {
          from: 'user',
        }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      const payload = JSON.parse(getStdout()) as {
        metadata: { suggestedTopics: string[]; suggestionScope: string }
      }
      expect(payload.metadata.suggestedTopics).toEqual(['code-graph:classes/BulkSessionStateError'])
      // No collection was named, so nothing to have got wrong.
      expect(payload.metadata.suggestionScope).toBe('requested-collection')
    })

    it('names the cross-collection title in the message', async () => {
      captureStdout()
      const getStderr = captureStderr()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'sdk:classes/BulkSessionStateError'], {
          from: 'user',
        }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      expect(getStderr()).toContain(
        "Guide topic 'sdk:classes/BulkSessionStateError' not found. That title exists in another collection: code-graph:classes/BulkSessionStateError.",
      )
    })

    it('resolves a title-matched suggestion when pasted back as a topic', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'code-graph:classes/GetGraphHealth'], {
        from: 'user',
      })

      expect(getStdout()).toContain('graph statistics')
    })
  })

  describe('metadata inspection', () => {
    it('emits metadata and outline without the document body', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:ports', '--meta'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('collection: core')
      expect(out).toContain('title: Ports')
      expect(out).toContain('file:  ports.md')
      expect(out).toContain('HEADING')
      expect(out).not.toContain('Ports are the interfaces between the application layer')
    })

    it('emits structured metadata under json', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:ports', '--meta', '--format', 'json'], {
        from: 'user',
      })

      const data = JSON.parse(getStdout()) as Record<string, unknown>
      expect(data.collection).toBe('core')
      expect(data.topic).toBe('ports')
      expect(data.title).toBe('Ports')
      expect(typeof data.order).toBe('number')
      expect(typeof data.lines).toBe('number')
      expect(typeof data.bytes).toBe('number')
      expect(Array.isArray(data.outline)).toBe(true)
      expect(data).not.toHaveProperty('content')
    })

    it('omits package and import metadata for a hand-written topic', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:ports', '--meta', '--format', 'json'], {
        from: 'user',
      })

      const data = JSON.parse(getStdout()) as Record<string, unknown>
      expect(data).not.toHaveProperty('packageName')
      expect(data).not.toHaveProperty('importStatement')
    })

    it('reports the published package and import statement for a generated topic', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'code-graph:classes/GetGraphHealth', '--meta', '--format', 'json'],
        { from: 'user' },
      )

      const data = JSON.parse(getStdout()) as Record<string, unknown>
      expect(data.packageName).toBe('@specd/code-graph')
      // A class has a value form, so it must not be imported type-only.
      expect(data.importStatement).toBe("import { GetGraphHealth } from '@specd/code-graph'")
      // The declaration's filesystem path is internal bookkeeping. A generated topic reaches
      // its caller through the published package, so the path is withheld from the payload.
      expect(data).not.toHaveProperty('file')
    })

    it('omits the source path from TOON metadata as well', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'code-graph:classes/GetGraphHealth', '--meta', '--format', 'toon'],
        { from: 'user' },
      )

      const out = getStdout()
      expect(out).toContain('packageName: @specd/code-graph')
      expect(out).not.toContain('file:')
      expect(out).not.toContain('get-graph-health.ts')
    })

    it('keeps the source path for a hand-written document', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:ports', '--meta', '--format', 'json'], {
        from: 'user',
      })

      const data = JSON.parse(getStdout()) as Record<string, unknown>
      // A hand-written document has no published package to import from, so its path is the
      // only thing telling the reader where the content comes from.
      expect(data.file).toBeTruthy()
    })

    it('imports interfaces type-only because they have no value form', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'core:interfaces/ActorIdentity', '--meta', '--format', 'json'],
        { from: 'user' },
      )

      const data = JSON.parse(getStdout()) as Record<string, unknown>
      expect(data.importStatement).toBe("import type { ActorIdentity } from '@specd/core'")
    })

    it('leads the text metadata with the import statement and withholds the source path', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'code-graph:classes/GetGraphHealth', '--meta'],
        { from: 'user' },
      )

      const out = getStdout()
      expect(out).toContain('package: @specd/code-graph')
      expect(out).toContain("import:  import { GetGraphHealth } from '@specd/code-graph'")
      expect(out).not.toContain('file:')
    })

    it('documents the call shape so a caller can use the topic without the source', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'code-graph:classes/GetGraphHealth'], {
        from: 'user',
      })

      const out = getStdout()
      expect(out).toContain("Import: `import { GetGraphHealth } from '@specd/code-graph'`")
      expect(out).toContain('## Signature')
      expect(out).toContain('## Constructor')
      expect(out).toContain('## Methods')
      expect(out).toContain('## Usage')
      expect(out).toContain('## Related types')
      expect(out).toContain('`code-graph:interfaces/GetGraphHealthInput`')
      expect(out).not.toContain('Declared in')
    })

    it('keeps a summary written with inline code and link tags in one paragraph', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'sdk:classes/HookResult'], { from: 'user' })

      const out = getStdout()
      // The summary arrives as several inline runs of one sentence. They must be rejoined
      // using the spacing they were written with, rather than each becoming its own
      // paragraph, which would read as "executing a" / "`run:`" / "hook command via".
      expect(out).toContain('The result of executing a `run:` hook command via HookRunner.')
      expect(out).toContain('Captures the process exit code')
      // The two sentences are separated by a real blank line, not merely a wrap.
      expect(out).toMatch(/HookRunner\.\n\nCaptures the process exit code/)
      expect(out).toContain('Use `isSuccess()`')
    })

    it('uses a declared example verbatim, keeping its own fence and indentation', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:classes/DomainPath'], { from: 'user' })

      const out = getStdout()
      const usage = out.slice(out.indexOf('## Usage'), out.indexOf('## Related types'))
      // The example brings its own fence, so wrapping it in a second one would break the block.
      expect(usage.match(/```/g) ?? []).toHaveLength(2)
      expect(usage).toContain('```ts')
      expect(usage).toContain("ArchivePath.parse('2024/my-feature')")
      // The generated skeleton is only a fallback; a declared example replaces it.
      expect(usage).not.toContain('const domainPath =')
    })

    it('documents only the members the symbol declares, not those inherited from the standard library', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'code-graph:classes/BulkSessionStateError'], {
        from: 'user',
      })

      const out = getStdout()
      const fields = out.slice(out.indexOf('## Fields'), out.indexOf('## Usage'))
      // The class declares a `code` getter and a constructor, and extends SpecdCodeGraphError.
      expect(fields).toMatch(/\|\s*`code`\s*\|/)
      expect(fields).toContain('string')
      expect(out).toContain('new BulkSessionStateError(message: string)')
      expect(out).toContain('extends SpecdCodeGraphError')
      // `cause`, `message`, `name`, `stack` and `stackTraceLimit` come from the standard
      // library's Error class. They say nothing about this symbol, and `stackTraceLimit`'s
      // JSDoc is long enough to stretch the whole table across hundreds of characters.
      expect(out).not.toContain('`stackTraceLimit`')
      expect(out).not.toContain('`cause`')
      expect(out).not.toContain('prepareStackTrace')
    })

    it('keeps the members a re-exported symbol declares in the package that declares it', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'sdk:classes/HookResult'], { from: 'user' })

      const out = getStdout()
      // HookResult is declared in @specd/core and re-exported by @specd/sdk. Deciding which
      // declarations count as "this project's own" against the entry point's package alone
      // emptied every member of the re-exported topic, because its declaration paths point
      // at core. Membership must be judged against every workspace package.
      expect(out).toContain("Import: `import { HookResult } from '@specd/sdk'`")
      expect(out).toContain('new HookResult(exitCode: number, stdout: string, stderr: string)')
      expect(out).toContain('## Methods')
      expect(out).toContain('isSuccess(): boolean')
      expect(out).toContain('stdout(): string')
    })

    it('documents the methods an interface declares', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'code-graph:interfaces/CodeGraphProvider'], {
        from: 'user',
      })

      const out = getStdout()
      // A port or a provider declares signatures and almost no fields, so rendering only the
      // field table documented these as a bare name.
      expect(out).toContain('## Methods')
      expect(out).toMatch(/### analyzeFileImpact/)
      expect(out).toContain('`filePath`')
      expect(out).toContain('Promise<FileImpactResult>')
    })
  })

  describe('section extraction', () => {
    it('extracts the section at a 1-indexed outline position', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:ports', '--section', '3'], {
        from: 'user',
      })

      expect(getStdout()).toContain('## Repository base class')
    })

    it('does not mistake the collection delimiter for a section selector', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'core:ports', '--section', '2'], {
        from: 'user',
      })

      expect(getStdout()).toContain('## Kernel composition surface')
    })

    it('matches a text selector case-insensitively', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'core:ports', '--section', 'KERNEL composition SURFACE'],
        { from: 'user' },
      )

      expect(getStdout()).toContain('## Kernel composition surface')
    })

    it('resolves a kebab-case slug to the same section', async () => {
      const byHeading = captureStdout()
      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'core:ports', '--section', 'Repository base class'],
        { from: 'user' },
      )

      const bySlug = captureStdout()
      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'core:ports', '--section', 'repository-base-class'],
        { from: 'user' },
      )

      expect(bySlug()).toBe(byHeading())
    })

    it('exits 1 with available headings for an unknown section', async () => {
      captureStdout()
      const getStderr = captureStderr()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', 'core:ports', '--section', 'Nonexistent'], {
          from: 'user',
        }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      const err = getStderr()
      expect(err).toContain('UNKNOWN_GUIDE_SECTION')
      expect(err).toContain('Kernel composition surface')
    })
  })

  describe('line slicing', () => {
    it('slices a line window and prefixes line numbers', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'core:ports', '--start-line', '95', '--lines', '3', '--line-numbers'],
        { from: 'user' },
      )

      const out = getStdout()
      expect(out).toContain('95 |')
      expect(out).not.toContain('94 |')
    })

    it('supports slicing inside an extracted section', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'core:ports', '--section', '2', '--lines', '2', '--line-numbers'],
        { from: 'user' },
      )

      expect(getStdout()).toContain('|')
    })
  })

  describe('search', () => {
    it('returns ranked hits with a guide-sdk read command', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'search', 'kernel composition', '--limit', '3'],
        { from: 'user' },
      )

      const out = getStdout()
      expect(out).toContain('specd guide-sdk')
      expect(out).not.toContain('specd guide core:')
    })

    it('restricts hits to one collection', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        [
          'guide-sdk',
          'search',
          'dependency',
          '--collection',
          'code-graph',
          '--limit',
          '5',
          '--format',
          'json',
        ],
        { from: 'user' },
      )

      const hits = JSON.parse(getStdout()) as Array<{ collection: string }>
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.every((h) => h.collection === 'code-graph')).toBe(true)
    })

    it('emits structured hits under json', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'search', 'kernel', '--limit', '2', '--format', 'json'],
        { from: 'user' },
      )

      const hits = JSON.parse(getStdout()) as Array<Record<string, unknown>>
      expect(Array.isArray(hits)).toBe(true)
      expect(hits[0]).toHaveProperty('collection')
      expect(hits[0]).toHaveProperty('topic')
      expect(String(hits[0]!.readCommand).startsWith('specd guide-sdk ')).toBe(true)
    })

    it('withholds the declaration path on generated hits and keeps it on written ones', async () => {
      const getStdout = captureStdout()

      // One query reaching both kinds of topic, because the rule is per topic and not per
      // collection: the same response must disclose a written document's path and hide the
      // declaration behind a generated symbol.
      await makeSdkProgram().parseAsync(
        ['guide-sdk', 'search', 'config writer', '--limit', '6', '--format', 'json'],
        { from: 'user' },
      )

      const hits = JSON.parse(getStdout()) as Array<Record<string, unknown>>
      const generated = hits.filter((hit) => String(hit.topic).includes('/'))
      const written = hits.filter((hit) => !String(hit.topic).includes('/'))

      expect(generated.length).toBeGreaterThan(0)
      expect(written.length).toBeGreaterThan(0)
      for (const hit of generated) {
        expect(hit).not.toHaveProperty('file')
        expect(hit).toHaveProperty('section')
        expect(hit).toHaveProperty('readCommand')
      }
      for (const hit of written) {
        expect(hit).toHaveProperty('file')
      }
    })

    it('emits an empty result set for a blank query', async () => {
      const getStdout = captureStdout()

      await makeSdkProgram().parseAsync(['guide-sdk', 'search', '   '], { from: 'user' })

      expect(getStdout().trim()).not.toBe('')
    })
  })

  describe('error mapping', () => {
    it('reports an invalid format through the standard error route', async () => {
      captureStdout()
      const getStderr = captureStderr()

      await expect(
        makeSdkProgram().parseAsync(['guide-sdk', '--format', 'xml'], { from: 'user' }),
      ).rejects.toBeInstanceOf(ExitSentinel)

      const err = getStderr()
      expect(err).toContain('invalid format')
      expect(err).toContain('text, json, toon')
    })
  })

  describe('registration and lazy loading', () => {
    it('registers guide-sdk without resolving its engine until an action runs', async () => {
      const resolveEngine = vi.fn(async () => createGuideSdkEngine())
      const program = makeProgram()
      registerGuideSdkCommand(program, resolveEngine)

      expect(program.commands.map((command) => command.name())).toContain('guide-sdk')
      expect(resolveEngine).not.toHaveBeenCalled()

      const getStdout = captureStdout()
      await expect(program.parseAsync(['guide-sdk', '--help'], { from: 'user' })).rejects.toThrow()
      expect(getStdout()).toContain('JSON/TOON output schema:')
      expect(resolveEngine).not.toHaveBeenCalled()
    })
  })
})

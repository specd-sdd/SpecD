import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from '../helpers.js'
import { registerGuideCommand } from '../../../src/commands/guide/index.js'

describe('CLI guide command', () => {
  beforeEach(() => {
    mockProcessExit()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('catalog listing', () => {
    it('lists all available guide topics in text table format by default', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('TOPIC')
      expect(out).toContain('TITLE')
      expect(out).toContain('DESCRIPTION')
      expect(out).toContain('getting-started')
      expect(out).toContain('workflow')
      expect(out).toContain('configuration')
      expect(out).toContain('schemas')
      expect(out).toContain('code-graph')
    })

    it('lists catalog in JSON format with --format json', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', '--format', 'json'], { from: 'user' })

      const out = getStdout()
      const data = JSON.parse(out)
      // The listing is wrapped in an envelope so the SDK guide discovery field can be
      // carried as a structured sibling of the entries.
      expect(Array.isArray(data.topics)).toBe(true)
      expect(data.topics.length).toBeGreaterThanOrEqual(10)
      expect(data.topics[0]).toHaveProperty('topic')
      expect(data.topics[0]).toHaveProperty('title')
      expect(data.topics[0]).toHaveProperty('description')
      expect(data.topics[0]).toHaveProperty('order')
      expect(data).toHaveProperty('sdkGuide')
    })

    it('lists catalog in TOON format with --format toon', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', '--format', 'toon'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('getting-started')
      expect(out).toContain('workflow')
      expect(out).toContain('topic,title,description')
    })
  })

  describe('listing envelope', () => {
    it('reports pagination and collection extents for the user guide catalog', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', '--page-size', '5', '--page', '2', '--format', 'json'], {
        from: 'user',
      })

      const data = JSON.parse(getStdout()) as {
        topics: Array<{ page: number; scope: string }>
        pagination: Record<string, number>
        collections: unknown[]
      }
      expect(data.topics).toHaveLength(5)
      expect(data.pagination).toMatchObject({ page: 2, pageSize: 5, returned: 5 })
      expect(data.pagination['total']).toBe(22)
      expect(data.pagination['totalPages']).toBe(5)
      expect(data.collections).toEqual([
        { collection: 'guide', total: 22, firstPage: 1, lastPage: 5 },
      ])
      expect(data.topics.every((t) => t.page === 2)).toBe(true)
      // Every entry declares its kind, so the caller does not infer it from the path.
      expect(data.topics.every((t) => t.scope === 'docs')).toBe(true)
    })

    it('reports the page position in text output only when several pages exist', async () => {
      const paged = captureStdout()
      const pagedProgram = makeProgram()
      registerGuideCommand(pagedProgram)
      await pagedProgram.parseAsync(['guide', '--page-size', '5'], { from: 'user' })
      expect(paged()).toContain('page 1 of 5 · 5 of 22 topics')

      const single = captureStdout()
      const singleProgram = makeProgram()
      registerGuideCommand(singleProgram)
      await singleProgram.parseAsync(['guide'], { from: 'user' })
      expect(single()).not.toMatch(/page \d+ of \d+/)
    })

    it('emits the same envelope shape as the SDK guide command', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', '--page-size', '3', '--format', 'json'], { from: 'user' })

      const data = JSON.parse(getStdout()) as Record<string, Record<string, unknown>>
      for (const key of ['topics', 'pagination', 'collections', 'sdkGuide']) {
        expect(data).toHaveProperty(key)
      }
      expect(Object.keys(data['pagination'] ?? {}).sort()).toEqual([
        'page',
        'pageSize',
        'returned',
        'total',
        'totalPages',
      ])
    })
  })

  describe('catalog index', () => {
    it('returns a bounded index instead of a plain listing for --meta without a topic', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', '--meta', '--page-size', '4', '--format', 'json'], {
        from: 'user',
      })

      const data = JSON.parse(getStdout()) as {
        collections: unknown[]
        pagination: Record<string, number>
        readHint: string
        topics: Array<Record<string, unknown>>
      }
      expect(data.collections).toEqual([
        { collection: 'guide', total: 22, firstPage: 1, lastPage: 6 },
      ])
      expect(data.pagination).toMatchObject({ page: 1, pageSize: 4, returned: 4, total: 22 })
      expect(data.topics).toHaveLength(4)

      const first = data.topics[0]!
      expect(first['collection']).toBe('guide')
      expect(first['scope']).toBe('docs')
      expect(typeof first['lines']).toBe('number')
      expect(typeof first['bytes']).toBe('number')
      expect(first['page']).toBe(1)
      // The read shape is stated once, not repeated per topic.
      expect(data.readHint).toBe('specd guide <topic>')
      expect(first['readCommand']).toBeUndefined()
    })

    it('renders the index as tables with a page position in text output', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', '--meta', '--page-size', '4'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('collections:')
      expect(out).toContain('PAGE')
      expect(out).toContain('SCOPE')
      expect(out).toContain('read: specd guide <topic>')
      expect(out).toContain('page 1 of 6 · 4 of 22 topics')
      // No per-row read command column.
      expect(out).not.toContain('READ')
    })

    it("still returns a single topic's metadata when a topic is supplied", async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'what-is-specd', '--meta'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('what-is-specd')
      // A single topic reports its own metadata and outline, not the catalog index.
      expect(out).toContain('HEADING')
      expect(out).not.toContain('collections:')
    })
  })

  describe('option validation', () => {
    it('rejects --section, --start-line, and --lines without a topic', async () => {
      for (const flag of [
        ['--section', '2'],
        ['--start-line', '3'],
        ['--lines', '5'],
      ]) {
        const getStdout = captureStdout()
        const getStderr = captureStderr()
        const program = makeProgram()
        registerGuideCommand(program)

        await expect(
          program.parseAsync(['guide', ...flag, '--format', 'json'], { from: 'user' }),
        ).rejects.toBeInstanceOf(ExitSentinel)

        expect(getStderr()).toContain(`${flag[0]} requires a <topic> argument`)
        // Only the structured error is emitted; no catalog listing is rendered,
        // because that would silently discard the caller's request.
        const errPayload = JSON.parse(getStdout().trim()) as { code: string; exitCode: number }
        expect(errPayload).toMatchObject({
          code: 'MISSING_GUIDE_TOPIC',
          exitCode: 1,
        })
        expect(getStdout()).not.toContain('getting-started')
        vi.restoreAllMocks()
        mockProcessExit()
      }
    })

    it('names the sibling SDK guide in --help', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await expect(program.parseAsync(['guide', '--help'], { from: 'user' })).rejects.toThrow()

      const help = getStdout()
      expect(help).toContain('specd guide-sdk')
      expect(help).toContain('SDK and extension')
    })
  })

  describe('SDK guide discovery field', () => {
    it('surfaces specd guide-sdk in text output', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('sdkGuide')
      expect(out).toContain('specd guide-sdk')
    })

    it('surfaces specd guide-sdk as a structured field in json output', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', '--format', 'json'], { from: 'user' })

      const data = JSON.parse(getStdout())
      expect(data.sdkGuide).toBeDefined()
      expect(data.sdkGuide.command).toBe('specd guide-sdk')
      expect(data.sdkGuide.collections).toContain('sdk')
    })

    it('surfaces specd guide-sdk as a structured field in toon output', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', '--format', 'toon'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('sdkGuide')
      expect(out).toContain('specd guide-sdk')
    })
  })

  describe('topic inspection', () => {
    it('outputs full raw content of a topic in text format by default', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'getting-started'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('# Getting Started with SpecD')
    })

    it('resolves topic query case-insensitively', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'WORKFLOW'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('Change Lifecycle Guide')
    })

    it('exits with code 1 and UNKNOWN_GUIDE_TOPIC when topic does not exist', async () => {
      const getStderr = captureStderr()
      const program = makeProgram()
      registerGuideCommand(program)

      await expect(
        program.parseAsync(['guide', 'non-existent-topic'], { from: 'user' }),
      ).rejects.toThrow(ExitSentinel)

      const err = getStderr()
      expect(err).toContain('UNKNOWN_GUIDE_TOPIC')
      expect(err).toContain('Available topics:')
    })
  })

  describe('metadata and outline inspection (--meta)', () => {
    it('returns document statistics and section outline table', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'schemas', '--meta'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('topic: schemas')
      expect(out).toContain('file:')
      expect(out).toContain('schemas.md')
      expect(out).toContain('lines:')
      expect(out).toContain('bytes:')
      expect(out).toContain('INDEX')
      expect(out).toContain('HEADING')
      // Ensure full text body is not emitted
      expect(out).not.toContain('Forking is appropriate when you need to make structural changes')
    })

    it('outputs outline in TOON format with --format toon', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'configuration', '--meta', '--format', 'toon'], {
        from: 'user',
      })

      const out = getStdout()
      expect(out).toContain('topic: configuration')
      expect(out).toContain('outline[')
      expect(out).toContain('index,heading,level,startLine,endLine,lines')
    })
  })

  describe('section and window slicing', () => {
    it('extracts specific section by heading name', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'workflow', '--section', 'States explained'], {
        from: 'user',
      })

      const out = getStdout()
      expect(out).toContain('## States explained')
      expect(out).toContain('`drafting`')
    })

    it('extracts specific section by 1-indexed section number', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'workflow', '--section', '4'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('## States explained')
    })

    it('resolves duplicate section titles deterministically via section index', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'configuration', '--section', '12'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('## Config cascade and local variants')
    })

    it('exits with code 1 and AMBIGUOUS_GUIDE_SECTION on duplicate heading names', async () => {
      const getStderr = captureStderr()
      const program = makeProgram()
      registerGuideCommand(program)

      await expect(
        program.parseAsync(
          ['guide', 'configuration', '--section', 'Config cascade and local variants'],
          { from: 'user' },
        ),
      ).rejects.toThrow(ExitSentinel)

      const err = getStderr()
      expect(err).toContain('AMBIGUOUS_GUIDE_SECTION')
      expect(err).toContain('Matching sections:')
      expect(err).toContain('[12]')
      expect(err).toContain('[49]')
      expect(err).toContain('Disambiguate with:')
    })

    it('exits with code 1 and UNKNOWN_GUIDE_SECTION on non-existent section', async () => {
      const getStderr = captureStderr()
      const program = makeProgram()
      registerGuideCommand(program)

      await expect(
        program.parseAsync(['guide', 'workflow', '--section', 'NonExistentHeading'], {
          from: 'user',
        }),
      ).rejects.toThrow(ExitSentinel)

      const err = getStderr()
      expect(err).toContain('UNKNOWN_GUIDE_SECTION')
      expect(err).toContain('Available sections in guide:')
    })

    it('slices bounded window with --start-line and --lines', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'workflow', '--start-line', '11', '--lines', '10'], {
        from: 'user',
      })

      const out = getStdout().trimEnd()
      const lineCount = out.split('\n').length
      expect(lineCount).toBe(10)
    })

    it('prefixes line numbers with --line-numbers', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(
        ['guide', 'workflow', '--start-line', '1', '--lines', '5', '--line-numbers'],
        { from: 'user' },
      )

      const out = getStdout()
      expect(out).toMatch(/^\s*1 \|/m)
      expect(out).toMatch(/^\s*5 \|/m)
    })

    it('prefixes absolute line numbers when combining --section and --line-numbers', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'workflow', '--section', '4', '--line-numbers'], {
        from: 'user',
      })

      const out = getStdout()
      // Section 4 starts at line 49
      expect(out).toMatch(/^\s*49 \| ## States explained/m)
    })
  })

  describe('guide search subcommand', () => {
    it('returns ranked search results with snippets and read commands', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'search', 'lifecycle states'], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('Transitioning Lifecycle States')
      expect(out).toContain('Read: specd guide ')
    })

    it('scopes results to specific topic with --topic', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'search', 'schema', '--topic', 'standard-schema'], {
        from: 'user',
      })

      const out = getStdout()
      expect(out).toContain('standard-schema')
      expect(out).not.toContain('getting-started')
    })

    it('limits match count with --limit', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'search', 'spec', '--limit', '2', '--format', 'json'], {
        from: 'user',
      })

      const out = getStdout()
      const data = JSON.parse(out)
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeLessThanOrEqual(2)
    })

    it('handles empty query gracefully with exit 0', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'search', ''], { from: 'user' })

      const out = getStdout()
      expect(out).toContain('No matching guide sections found.')
    })

    it('outputs search results in TOON format with --format toon', async () => {
      const getStdout = captureStdout()
      const program = makeProgram()
      registerGuideCommand(program)

      await program.parseAsync(['guide', 'search', 'lifecycle', '--format', 'toon'], {
        from: 'user',
      })

      const out = getStdout()
      expect(out).toContain('topic')
      expect(out).toContain('section')
      expect(out).toContain('readCommand')
    })
  })

  describe('invalid format handling', () => {
    it('exits with code 1 when format is invalid', async () => {
      const getStderr = captureStderr()
      const program = makeProgram()
      registerGuideCommand(program)

      await expect(
        program.parseAsync(['guide', '--format', 'unsupported'], { from: 'user' }),
      ).rejects.toThrow(ExitSentinel)

      const err = getStderr()
      expect(err).toContain("invalid format 'unsupported'")
    })
  })
})

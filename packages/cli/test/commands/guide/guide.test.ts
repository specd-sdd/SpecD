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
      expect(Array.isArray(data)).toBe(true)
      expect(data.length).toBeGreaterThanOrEqual(10)
      expect(data[0]).toHaveProperty('topic')
      expect(data[0]).toHaveProperty('title')
      expect(data[0]).toHaveProperty('description')
      expect(data[0]).toHaveProperty('order')
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
      expect(err).toContain('[47]')
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
      expect(out).toContain('workflow')
      expect(out).toContain('Read: specd guide workflow --section')
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

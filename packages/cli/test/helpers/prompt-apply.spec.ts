import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  promptSelectImplementationLinks,
  promptSelectSpecDependencies,
} from '../../src/helpers/prompt-apply.js'

vi.mock('@clack/prompts', () => ({
  multiselect: vi.fn(),
  isCancel: vi.fn((val) => val === Symbol.for('cancel')),
  log: {
    info: vi.fn(),
  },
}))

import { multiselect, log } from '@clack/prompts'

describe('prompt-apply helper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('promptSelectImplementationLinks', () => {
    it('returns empty array immediately if all suggestions are already included and logs them', async () => {
      const result = await promptSelectImplementationLinks('test:spec', [
        {
          file: 'src/index.ts',
          symbols: ['foo'],
          confidence: 'HIGH',
          alreadyIncluded: true,
        },
      ])
      expect(result).toEqual([])
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining('[already included] [HIGH] src/index.ts [foo]'),
      )
      expect(multiselect).not.toHaveBeenCalled()
    })

    it('prompts user and pre-selects HIGH confidence items', async () => {
      const candidates = [
        {
          file: 'src/a.ts',
          symbols: ['funcA'],
          confidence: 'HIGH' as const,
          alreadyIncluded: false,
        },
        {
          file: 'src/b.ts',
          symbols: [],
          confidence: 'LOW' as const,
          alreadyIncluded: false,
        },
      ]

      vi.mocked(multiselect).mockResolvedValue(['0'] as never)

      const result = await promptSelectImplementationLinks('test:spec', candidates)
      expect(multiselect).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Select candidate implementation links to apply for ['),
          initialValues: ['0'],
        }),
      )
      expect(result).toEqual([candidates[0]])
    })

    it('returns null when user cancels prompt', async () => {
      const candidates = [
        {
          file: 'src/a.ts',
          symbols: [],
          confidence: 'HIGH' as const,
          alreadyIncluded: false,
        },
      ]

      vi.mocked(multiselect).mockResolvedValue(Symbol.for('cancel') as never)

      const result = await promptSelectImplementationLinks('test:spec', candidates)
      expect(result).toBeNull()
    })
  })

  describe('promptSelectSpecDependencies', () => {
    it('returns empty array if no unapplied dependencies exist and logs them', async () => {
      const result = await promptSelectSpecDependencies('test:spec', [
        { specId: 'dep:1', reason: 'import', alreadyIncluded: true },
      ])
      expect(result).toEqual([])
      expect(log.info).toHaveBeenCalledWith(
        expect.stringContaining('[already included] dep:1 — import'),
      )
      expect(multiselect).not.toHaveBeenCalled()
    })

    it('prompts user and returns selection', async () => {
      const candidates = [{ specId: 'dep:1', reason: 'code import', alreadyIncluded: false }]

      vi.mocked(multiselect).mockResolvedValue(['0'] as never)

      const result = await promptSelectSpecDependencies('test:spec', candidates)
      expect(multiselect).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Select candidate dependencies to apply for'),
        }),
      )
      expect(result).toEqual(candidates)
    })

    it('returns null when cancelled', async () => {
      const candidates = [{ specId: 'dep:1', reason: 'code import', alreadyIncluded: false }]

      vi.mocked(multiselect).mockResolvedValue(Symbol.for('cancel') as never)

      const result = await promptSelectSpecDependencies('test:spec', candidates)
      expect(result).toBeNull()
    })
  })

  describe('wrapForClack', () => {
    it('returns short lines unchanged', async () => {
      const { wrapForClack } = await import('../../src/helpers/prompt-apply.js')
      const input = 'short line\nanother line'
      expect(wrapForClack(input, 80)).toBe(input)
    })

    it('wraps long lines and preserves initial whitespace + 4 on continuation rows with ellipsis markers', async () => {
      const { wrapForClack } = await import('../../src/helpers/prompt-apply.js')

      // 0 initial spaces -> continuation has 4 spaces and ellipsis
      const line0 = 'firstword secondword thirdword fourthword fifthword'
      const wrap0 = wrapForClack(line0, 20)
      const lines0 = wrap0.split('\n')
      expect(lines0.length).toBeGreaterThan(1)
      expect(lines0[0]).toMatch(/\.\.\.$/)
      expect(lines0[1]).toMatch(/^ {4}\.\.\. /)

      // 2 initial spaces -> continuation has 2 + 4 = 6 spaces and ellipsis
      const line2 =
        '  • [new] [HIGH] packages/cli/src/commands/spec/very/long/path/to/file.ts [symbolA, symbolB]'
      const wrap2 = wrapForClack(line2, 45)
      const lines2 = wrap2.split('\n')
      expect(lines2.length).toBeGreaterThan(1)
      expect(lines2[0]).toMatch(/^  •/)
      expect(lines2[0]).toMatch(/\.\.\.$/)
      expect(lines2[1]).toMatch(/^ {6}\.\.\. /)

      // 4 initial spaces -> continuation has 4 + 4 = 8 spaces and ellipsis
      const line4 =
        '    suggestions: [new] [HIGH] packages/cli/src/commands/spec/very/long/path/to/file.ts'
      const wrap4 = wrapForClack(line4, 40)
      const lines4 = wrap4.split('\n')
      expect(lines4.length).toBeGreaterThan(1)
      expect(lines4[0]).toMatch(/^ {4}suggestions:/)
      expect(lines4[0]).toMatch(/\.\.\.$/)
      expect(lines4[1]).toMatch(/^ {8}\.\.\. /)
    })
  })
})

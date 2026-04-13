import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
  ExitSentinel,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerChangeDraft } from '../../src/commands/change/draft.js'
import {
  ChangeNotFoundError,
  InvalidChangeError,
  HistoricalImplementationGuardError,
} from '@specd/core'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, configFilePath: null, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Command signature', () => {
  it('Missing name argument', async () => {
    setup()

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await expect(program.parseAsync(['node', 'specd', 'change', 'draft'])).rejects.toThrow()
  })
})

describe('Behaviour', () => {
  it('Change moved to drafts', async () => {
    const { kernel } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change'])

    expect(kernel.changes.draft.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-change' }),
    )
  })

  it('Optional reason stored in history', async () => {
    const { kernel } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'draft',
      'my-change',
      '--reason',
      'on hold',
    ])

    expect(kernel.changes.draft.execute).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-change', reason: 'on hold' }),
    )
  })
})

describe('Output on success', () => {
  it('Success message', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change'])

    expect(stdout()).toContain('drafted change my-change')
  })

  it('JSON output on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('my-change')
  })
})

describe('Error cases', () => {
  it('Change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.draft.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerChangeDraft(program.command('change'))

    try {
      await program.parseAsync(['node', 'specd', 'change', 'draft', 'nonexistent'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(1)
    }

    expect(stderr()).toMatch(/error:/)
  })

  it('Already drafted', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.draft.execute.mockRejectedValue(
      new InvalidChangeError('my-change is already drafted'),
    )

    const program = makeProgram()
    registerChangeDraft(program.command('change'))

    try {
      await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(1)
    }

    expect(stderr()).toMatch(/error:/)
  })

  it('Historically implemented change requires force', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.draft.execute.mockRejectedValue(
      new HistoricalImplementationGuardError('draft', 'my-change'),
    )

    const program = makeProgram()
    registerChangeDraft(program.command('change'))

    try {
      await program.parseAsync(['node', 'specd', 'change', 'draft', 'my-change'])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(1)
    }

    expect(stderr()).toMatch(/implementing/)
    expect(stderr()).toMatch(/out of sync/)
  })

  it('Force flag is passed through to the use case', async () => {
    const { kernel } = setup()
    kernel.changes.draft.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDraft(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'draft',
      'my-change',
      '--reason',
      'intentional rollback of workflow only',
      '--force',
    ])

    expect(kernel.changes.draft.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-change',
        reason: 'intentional rollback of workflow only',
        force: true,
      }),
    )
  })
})

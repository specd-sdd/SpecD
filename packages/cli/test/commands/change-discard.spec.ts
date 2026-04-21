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
import { registerChangeDiscard } from '../../src/commands/change/discard.js'
import { ChangeNotFoundError, HistoricalImplementationGuardError } from '@specd/core'

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
  it('Missing reason flag', async () => {
    setup()

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'discard', 'my-change']),
    ).rejects.toThrow()
  })

  it('Empty reason rejected', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'discard', 'my-change', '--reason', ''])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

describe('Behaviour', () => {
  it('Active change discarded', async () => {
    const { kernel } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'old-experiment',
      '--reason',
      'superseded',
    ])

    expect(kernel.changes.discard.execute).toHaveBeenCalledWith({
      name: 'old-experiment',
      reason: 'superseded',
    })
  })

  it('Drafted change discarded', async () => {
    const { kernel } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'old-experiment',
      '--reason',
      'abandoned',
    ])

    expect(kernel.changes.discard.execute).toHaveBeenCalledWith({
      name: 'old-experiment',
      reason: 'abandoned',
    })
  })
})

describe('Output on success', () => {
  it('Success message', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'old-experiment',
      '--reason',
      'done',
    ])

    expect(stdout()).toContain('discarded change old-experiment')
  })

  it('JSON output on success', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'old-experiment',
      '--reason',
      'done',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.name).toBe('old-experiment')
  })
})

describe('Error cases', () => {
  it('Change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.discard.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'discard', 'nonexistent', '--reason', 'done'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('Historically implemented change requires force', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.discard.execute.mockRejectedValue(
      new HistoricalImplementationGuardError('discard', 'my-change'),
    )

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))

    try {
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'discard',
        'my-change',
        '--reason',
        'abandoned',
      ])
    } catch (err) {
      expect(err).toBeInstanceOf(ExitSentinel)
      expect((err as ExitSentinel).code).toBe(1)
    }

    expect(stderr()).toMatch(/implementing/)
    expect(stderr()).toMatch(/out of sync/)
  })

  it('Force flag is passed through to the use case', async () => {
    const { kernel } = setup()
    kernel.changes.discard.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerChangeDiscard(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'discard',
      'my-change',
      '--reason',
      'intentional rollback',
      '--force',
    ])

    expect(kernel.changes.discard.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-change',
        reason: 'intentional rollback',
        force: true,
      }),
    )
  })
})

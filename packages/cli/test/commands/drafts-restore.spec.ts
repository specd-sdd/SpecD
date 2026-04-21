import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { ChangeNotFoundError, InvalidChangeError } from '@specd/core'
import { registerDraftsRestore } from '../../src/commands/drafts/restore.js'

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
    registerDraftsRestore(program.command('drafts'))
    await expect(program.parseAsync(['node', 'specd', 'drafts', 'restore'])).rejects.toThrow()
  })
})

describe('Behaviour', () => {
  it('Change moved back to active', async () => {
    const { kernel } = setup()
    kernel.changes.restore.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'restore', 'old-experiment'])

    expect(kernel.changes.restore.execute).toHaveBeenCalledWith({ name: 'old-experiment' })
  })
})

describe('Output on success — text', () => {
  it('Success message — text', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.restore.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'restore', 'old-experiment'])

    expect(stdout()).toContain('restored change old-experiment')
  })
})

describe('Output on success — JSON and toon', () => {
  it('Success message — JSON', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.restore.execute.mockResolvedValue(undefined)

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync([
      'node',
      'specd',
      'drafts',
      'restore',
      'old-experiment',
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
    kernel.changes.restore.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'restore', 'nonexistent']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('Change not in drafts', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.restore.execute.mockRejectedValue(
      new InvalidChangeError('change is not drafted'),
    )

    const program = makeProgram()
    registerDraftsRestore(program.command('drafts'))
    await program.parseAsync(['node', 'specd', 'drafts', 'restore', 'my-change']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

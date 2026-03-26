import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangeNotFoundError } from '@specd/core'
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
import { registerChangeOverlap } from '../../src/commands/change/check-overlap.js'

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

describe('change overlap', () => {
  it('shows "no overlap detected" when no overlap exists', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.detectOverlap.execute.mockResolvedValue({
      hasOverlap: false,
      entries: [],
    })

    const program = makeProgram()
    registerChangeOverlap(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'check-overlap'])

    expect(stdout()).toContain('no overlap detected')
  })

  it('shows grouped text output when overlap exists', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.detectOverlap.execute.mockResolvedValue({
      hasOverlap: true,
      entries: [
        {
          specId: 'core:core/config',
          changes: [
            { name: 'alpha', state: 'designing' },
            { name: 'beta', state: 'implementing' },
          ],
        },
      ],
    })

    const program = makeProgram()
    registerChangeOverlap(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'check-overlap'])

    const out = stdout()
    expect(out).toContain('core:core/config')
    expect(out).toContain('alpha')
    expect(out).toContain('beta')
  })

  it('outputs JSON when --format json', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.detectOverlap.execute.mockResolvedValue({
      hasOverlap: true,
      entries: [
        {
          specId: 'core:core/config',
          changes: [{ name: 'alpha', state: 'designing' }],
        },
      ],
    })

    const program = makeProgram()
    registerChangeOverlap(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'check-overlap', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as { hasOverlap: boolean }
    expect(parsed.hasOverlap).toBe(true)
  })

  it('outputs empty JSON when no overlap in JSON mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.detectOverlap.execute.mockResolvedValue({
      hasOverlap: false,
      entries: [],
    })

    const program = makeProgram()
    registerChangeOverlap(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'check-overlap', '--format', 'json'])

    const parsed = JSON.parse(stdout()) as { hasOverlap: boolean }
    expect(parsed.hasOverlap).toBe(false)
  })

  it('passes name argument to execute', async () => {
    const { kernel } = setup()
    kernel.changes.detectOverlap.execute.mockResolvedValue({
      hasOverlap: false,
      entries: [],
    })

    const program = makeProgram()
    registerChangeOverlap(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'check-overlap', 'my-change'])

    expect(kernel.changes.detectOverlap.execute).toHaveBeenCalledWith({ name: 'my-change' })
  })

  it('shows error and exits 1 for nonexistent change', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.detectOverlap.execute.mockRejectedValue(new ChangeNotFoundError('nonexistent'))

    const program = makeProgram()
    registerChangeOverlap(program.command('change'))
    try {
      await program.parseAsync(['node', 'specd', 'change', 'check-overlap', 'nonexistent'])
    } catch (e) {
      if (!(e instanceof ExitSentinel)) throw e
    }

    expect(stderr()).toContain('nonexistent')
  })
})

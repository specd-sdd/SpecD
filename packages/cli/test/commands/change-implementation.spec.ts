/* eslint-disable */
import { stat } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  ExitSentinel,
} from './helpers.js'

vi.mock('node:fs/promises', () => ({
  stat: vi.fn(),
}))

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/commands/change/_implementation-tracking.js', () => ({
  enrichImplementationTracking: vi.fn(),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { enrichImplementationTracking } from '../../src/commands/change/_implementation-tracking.js'
import { registerChangeImplementation } from '../../src/commands/change/implementation.js'

afterEach(() => vi.restoreAllMocks())

describe('change implementation', () => {
  it('review shows stale symbols and out-of-scope sidecar preview', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: makeMockConfig(),
      configFilePath: null,
      kernel,
    })
    kernel.changes.getImplementationReview.execute.mockResolvedValue({
      specIds: ['core:change'],
      implementationTracking: {
        trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'resolved' }],
        links: [
          {
            specId: 'core:get-status',
            file: 'packages/core/src/change.ts',
            fileLinkExplicit: true,
            symbols: ['GetStatus.execute'],
          },
        ],
      },
    })
    vi.mocked(enrichImplementationTracking).mockResolvedValue({
      trackedFiles: [{ file: 'packages/core/src/change.ts', state: 'resolved' }],
      graphHint: {
        status: 'fresh',
        message: 'Code graph is fresh; stale symbol diagnostics are authoritative.',
      },
      links: [
        {
          specId: 'core:get-status',
          file: 'packages/core/src/change.ts',
          fileLinkExplicit: true,
          symbols: ['GetStatus.execute'],
          staleSymbols: ['GetStatus.execute'],
        },
      ],
    })
    const stdout = captureStdout()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'implementation', 'review', 'my-change'])

    const out = stdout()
    expect(out).toContain('out-of-scope sidecars:')
    expect(out).toContain('core:get-status')
    expect(out).toContain('stale=GetStatus.execute')
  })

  it('add fails when the implementation file does not exist', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: makeMockConfig(),
      configFilePath: null,
      kernel,
    })
    vi.mocked(stat).mockRejectedValue(new Error('ENOENT'))
    mockProcessExit()
    const stderr = captureStderr()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))

    try {
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'implementation',
        'add',
        'my-change',
        '--spec',
        'core:change',
        '--file',
        'missing.ts',
      ])
    } catch (e) {
      if (!(e instanceof ExitSentinel)) throw e
      expect(e.code).toBe(1)
    }

    expect(stderr()).toContain('error: Implementation file not found at: missing.ts')
    expect(kernel.changes.updateImplementationTracking.execute).not.toHaveBeenCalled()
  })

  it('resolve supports comma-separated file lists', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: makeMockConfig(),
      configFilePath: null,
      kernel,
    })
    vi.mocked(stat).mockResolvedValue({} as any)

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))

    await program.parseAsync([
      'node',
      'specd',
      'change',
      'implementation',
      'resolve',
      'my-change',
      '--file',
      'f1.ts, f2.ts',
    ])

    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledTimes(2)
    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'f1.ts' }),
    )
    expect(kernel.changes.updateImplementationTracking.execute).toHaveBeenCalledWith(
      expect.objectContaining({ file: 'f2.ts' }),
    )
  })

  it('ignore fails when any file in a comma-separated list is missing', async () => {
    const kernel = makeMockKernel()
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: makeMockConfig(),
      configFilePath: null,
      kernel,
    })
    vi.mocked(stat).mockImplementation(async (filePath: any) => {
      if (String(filePath).endsWith('missing.ts')) throw new Error('ENOENT')

      return {} as any
    })
    mockProcessExit()
    const stderr = captureStderr()

    const program = makeProgram()
    registerChangeImplementation(program.command('change'))

    try {
      await program.parseAsync([
        'node',
        'specd',
        'change',
        'implementation',
        'ignore',
        'my-change',
        '--file',
        'exists.ts,missing.ts',
      ])
    } catch (e) {
      if (!(e instanceof ExitSentinel)) throw e
    }

    expect(stderr()).toContain('error: Implementation file not found at: missing.ts')
    expect(kernel.changes.updateImplementationTracking.execute).not.toHaveBeenCalled()
  })
})

/* eslint-disable @typescript-eslint/unbound-method */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { ChangeNotFoundError } from '@specd/core'
import {
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({ loadConfig: vi.fn() }))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerChangeContext } from '../../src/commands/change/context.js'

const mockResult = {
  contextBlock: '# Designing step instructions\n\nDo this.',
  stepAvailable: true,
  blockingArtifacts: [] as string[],
  warnings: [] as { message: string }[],
}

function setup() {
  const config = makeMockConfig({
    workspaces: [
      {
        name: 'default',
        specsPath: '/project/specs',
        schemasPath: null,
        codeRoot: '/project',
        ownership: 'owned' as const,
        isExternal: false,
      },
    ],
  })
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  kernel.changes.compile.execute.mockResolvedValue({ ...mockResult })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change context', () => {
  it('prints instruction block verbatim in text format', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'context', 'my-change', 'designing'])

    expect(stdout()).toContain('# Designing step instructions')
    expect(stdout()).toContain('Do this.')
  })

  it('outputs JSON with contextBlock, stepAvailable, blockingArtifacts, warnings', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'context',
      'my-change',
      'designing',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.contextBlock).toContain('Designing step instructions')
    expect(parsed.stepAvailable).toBe(true)
    expect(Array.isArray(parsed.blockingArtifacts)).toBe(true)
    expect(Array.isArray(parsed.warnings)).toBe(true)
  })

  it('passes --follow-deps flag to use case', async () => {
    const { kernel } = setup()
    captureStdout()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'context',
      'my-change',
      'designing',
      '--follow-deps',
    ])

    const call = kernel.changes.compile.execute.mock.calls[0]![0]
    expect(call.followDeps).toBe(true)
  })

  it('passes --depth with --follow-deps to use case', async () => {
    const { kernel } = setup()
    captureStdout()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'context',
      'my-change',
      'designing',
      '--follow-deps',
      '--depth',
      '2',
    ])

    const call = kernel.changes.compile.execute.mock.calls[0]![0]
    expect(call.followDeps).toBe(true)
    expect(call.depth).toBe(2)
  })

  it('exits 1 when --depth is used without --follow-deps', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'context', 'my-change', 'designing', '--depth', '2'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('--depth requires --follow-deps')
  })

  it('passes section flags to use case', async () => {
    const { kernel } = setup()
    captureStdout()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'context',
      'my-change',
      'designing',
      '--rules',
      '--constraints',
    ])

    const call = kernel.changes.compile.execute.mock.calls[0]![0]
    expect(call.sections).toContain('rules')
    expect(call.sections).toContain('constraints')
    expect(call.sections).not.toContain('scenarios')
  })

  it('warns to stderr when step not available', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.compile.execute.mockResolvedValue({
      ...mockResult,
      stepAvailable: false,
      blockingArtifacts: ['proposal', 'spec'],
    })

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'context', 'my-change', 'implementing'])

    expect(stderr()).toContain('warning:')
    expect(stderr()).toContain('proposal')
    expect(stderr()).toContain('spec')
  })

  it('warns to stderr for stale metadata', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.compile.execute.mockResolvedValue({
      ...mockResult,
      warnings: [{ message: 'spec auth/login has stale metadata' }],
    })

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'context', 'my-change', 'designing'])

    expect(stderr()).toContain('warning:')
    expect(stderr()).toContain('stale metadata')
  })

  it('exits 1 when step argument is missing', async () => {
    setup()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await expect(
      program.parseAsync(['node', 'specd', 'change', 'context', 'my-change']),
    ).rejects.toThrow()
  })

  it('includes all sections when no section flags are provided', async () => {
    const { kernel } = setup()
    captureStdout()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'context', 'my-change', 'implementing'])

    const call = kernel.changes.compile.execute.mock.calls[0]![0]
    expect(call.sections).toBeUndefined()
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.compile.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'context', 'missing', 'designing'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

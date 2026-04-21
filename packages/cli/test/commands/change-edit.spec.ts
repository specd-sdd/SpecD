import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockChange,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/load-config.js', () => ({
  loadConfig: vi.fn(),
  resolveConfigPath: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { ChangeNotFoundError } from '@specd/core'
import { registerChangeEdit } from '../../src/commands/change/edit.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockResolvedValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change edit', () => {
  it('exits 1 when no options provided', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'edit', 'feat']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('error:')
  })

  it('updates change with new spec', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stdout()).toContain('updated change feat')
    expect(stdout()).toContain('auth/login')
    expect(stdout()).toContain('auth/register')
  })

  it('warns to stderr when approvals invalidated', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', specIds: ['auth/register'] }),
      invalidated: true,
    })
    captureStdout()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stderr()).toContain('warning:')
    expect(stderr()).toContain('invalidated')
  })

  it('outputs JSON with invalidated flag', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({ name: 'feat', state: 'designing' }),
      invalidated: true,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/login',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(parsed.invalidated).toBe(true)
  })

  it('exits 1 when change not found', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.edit.execute.mockRejectedValue(new ChangeNotFoundError('missing'))

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'missing', '--add-spec', 'auth/login'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('does not append invalidated event when no active approval', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        state: 'designing',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
    ])

    expect(stdout()).toContain('updated change feat')
    const call = kernel.changes.edit.execute.mock.calls[0]![0]
    expect(call).toBeDefined()
  })

  it('includes specIds, workspaces, and state in JSON output', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.edit.execute.mockResolvedValue({
      change: makeMockChange({
        name: 'feat',
        state: 'designing',
        specIds: ['auth/login', 'auth/register'],
        workspaces: ['default'],
      }),
      invalidated: false,
    })

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'edit',
      'feat',
      '--add-spec',
      'auth/register',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.result).toBe('ok')
    expect(Array.isArray(parsed.specIds)).toBe(true)
    expect(parsed.specIds).toContain('auth/login')
    expect(parsed.specIds).toContain('auth/register')
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.workspaces).toContain('default')
    expect(parsed.state).toBe('designing')
  })

  it('exits 1 when --add-spec uses unknown workspace prefix', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'unknown-ws:some/path'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })

  it('exits 1 when --add-spec targets readOnly workspace', async () => {
    const config = makeMockConfig({
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project',
          ownership: 'owned' as const,
          isExternal: false,
        },
        {
          name: 'platform',
          specsPath: '/external/platform/specs',
          specsAdapter: { adapter: 'fs', config: { path: '/external/platform/specs' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/external/platform',
          ownership: 'readOnly' as const,
          isExternal: true,
        },
      ],
    })
    const kernel = makeMockKernel()
    vi.mocked(loadConfig).mockResolvedValue(config)
    vi.mocked(createCliKernel).mockResolvedValue(kernel)
    const stderr = captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerChangeEdit(program.command('change'))
    await program
      .parseAsync(['node', 'specd', 'change', 'edit', 'feat', '--add-spec', 'platform:auth/tokens'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('workspace "platform" is readOnly')
    expect(kernel.changes.edit.execute).not.toHaveBeenCalled()
  })
})

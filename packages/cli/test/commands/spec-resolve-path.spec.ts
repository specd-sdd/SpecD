/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { describe, it, expect, vi, afterEach } from 'vitest'
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
vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return { ...actual, stat: vi.fn() }
})

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerSpecResolvePath } from '../../src/commands/spec/resolve-path.js'
import { stat as mockStat } from 'node:fs/promises'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockReturnValue(kernel)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('spec resolve-path', () => {
  it('exits with error when path argument is missing', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))

    try {
      await program.parseAsync(['node', 'specd', 'spec', 'resolve-path'])
    } catch {
      // Commander throws with exitOverride
    }

    // Commander exits or throws when required arg is missing
    const out = stderr()
    const exitCalled = vi.mocked(process.exit).mock.calls.length > 0
    expect(exitCalled || out.length > 0).toBe(true)
  })

  it('resolves relative path from cwd', async () => {
    const { config, stdout } = setup()
    Object.assign(config, {
      workspaces: [
        {
          name: 'core',
          prefix: 'core',
          specsPath: '/project/specs/core',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    vi.mocked(mockStat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'resolve-path', 'specs/core/change'])

    expect(stdout()).toContain('core:core/change')
  })

  it('resolves absolute path and outputs specId in text mode', async () => {
    const { config, stdout } = setup()
    Object.assign(config, {
      workspaces: [
        {
          name: 'core',
          prefix: 'core',
          specsPath: '/project/specs/core',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    vi.mocked(mockStat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'resolve-path',
      '/project/specs/core/change',
    ])

    expect(stdout()).toContain('core:core/change')
  })

  it('outputs bare specId when workspace has no prefix', async () => {
    const { config, stdout } = setup()
    Object.assign(config, {
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    vi.mocked(mockStat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'resolve-path', '/project/specs/auth/login'])

    expect(stdout()).toContain('default:auth/login')
  })

  it('picks most specific workspace when multiple match', async () => {
    const { config, stdout } = setup()
    Object.assign(config, {
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
        {
          name: 'core',
          prefix: 'core',
          specsPath: '/project/specs/core',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    vi.mocked(mockStat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'resolve-path',
      '/project/specs/core/change',
    ])

    expect(stdout()).toContain('core:core/change')
  })

  it('outputs JSON with workspace, specPath, specId', async () => {
    const { config, stdout } = setup()
    Object.assign(config, {
      workspaces: [
        {
          name: 'core',
          prefix: 'core',
          specsPath: '/project/specs/core',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    vi.mocked(mockStat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'resolve-path',
      '/project/specs/core/change',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.workspace).toBe('core')
    expect(parsed.specPath).toBe('core/change')
    expect(parsed.specId).toBe('core:core/change')
  })

  it('resolves file path to parent directory', async () => {
    const { config, stdout } = setup()
    Object.assign(config, {
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    vi.mocked(mockStat).mockResolvedValue({ isDirectory: () => false } as any)
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'resolve-path',
      '/project/specs/auth/login/spec.md',
    ])

    expect(stdout()).toContain('default:auth/login')
  })

  it('exits 1 when path does not exist', async () => {
    setup()

    vi.mocked(mockStat).mockRejectedValue(new Error('ENOENT'))
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'resolve-path', '/nonexistent/path'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('exits 1 when path is not under any workspace', async () => {
    const { config, stderr } = setup()
    Object.assign(config, {
      workspaces: [
        {
          name: 'default',
          specsPath: '/project/specs',
          schemasPath: null,
          codeRoot: '/project',
          ownership: 'owned',
          isExternal: false,
        },
      ],
    })

    vi.mocked(mockStat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program
      .parseAsync(['node', 'specd', 'spec', 'resolve-path', '/other/path'])
      .catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toContain('does not fall under any configured workspace')
  })
})

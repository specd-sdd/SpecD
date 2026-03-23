/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { SpecPath, type SpecRepository } from '@specd/core'
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
import { registerSpecResolvePath } from '../../src/commands/spec/resolve-path.js'

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

    const out = stderr()
    const exitCalled = vi.mocked(process.exit).mock.calls.length > 0
    expect(exitCalled || out.length > 0).toBe(true)
  })

  it('resolves relative path from cwd', async () => {
    const { config, kernel, stdout } = setup()
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

    const mockRepo = {
      resolveFromPath: vi.fn().mockResolvedValue({
        specPath: SpecPath.parse('core/change'),
        specId: 'core:core/change',
      }),
    }
    kernel.specs.repos = new Map([['core', mockRepo as unknown as SpecRepository]])
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'resolve-path', 'specs/core/change'])

    expect(stdout()).toContain('core:core/change')
  })

  it('resolves absolute path and outputs specId in text mode', async () => {
    const { config, kernel, stdout } = setup()
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

    const mockRepo = {
      resolveFromPath: vi.fn().mockResolvedValue({
        specPath: SpecPath.parse('core/change'),
        specId: 'core:core/change',
      }),
    }
    kernel.specs.repos = new Map([['core', mockRepo as unknown as SpecRepository]])
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
    const { config, kernel, stdout } = setup()
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

    const mockRepo = {
      resolveFromPath: vi.fn().mockResolvedValue({
        specPath: SpecPath.parse('auth/login'),
        specId: 'default:auth/login',
      }),
    }
    kernel.specs.repos = new Map([['default', mockRepo as unknown as SpecRepository]])
    vi.spyOn(process, 'cwd').mockReturnValue('/project')

    const program = makeProgram()
    registerSpecResolvePath(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'resolve-path', '/project/specs/auth/login'])

    expect(stdout()).toContain('default:auth/login')
  })

  it('picks most specific workspace when multiple match', async () => {
    const { config, kernel, stdout } = setup()
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

    const defaultRepo = {
      resolveFromPath: vi.fn().mockResolvedValue({
        specPath: SpecPath.parse('core/change'),
        specId: 'default:core/change',
      }),
    }
    const coreRepo = {
      resolveFromPath: vi.fn().mockResolvedValue({
        specPath: SpecPath.parse('core/change'),
        specId: 'core:core/change',
      }),
    }
    kernel.specs.repos = new Map([
      ['default', defaultRepo as unknown as SpecRepository],
      ['core', coreRepo as unknown as SpecRepository],
    ])
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

    // Core workspace has longer specsPath, so it wins
    expect(stdout()).toContain('core:core/change')
  })

  it('outputs JSON with workspace, specPath, specId', async () => {
    const { config, kernel, stdout } = setup()
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

    const mockRepo = {
      resolveFromPath: vi.fn().mockResolvedValue({
        specPath: SpecPath.parse('core/change'),
        specId: 'core:core/change',
      }),
    }
    kernel.specs.repos = new Map([['core', mockRepo as unknown as SpecRepository]])
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

  it('exits 1 when path is not under any workspace', async () => {
    const { config, kernel, stderr } = setup()
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

    const mockRepo = {
      resolveFromPath: vi.fn().mockResolvedValue(null),
    }
    kernel.specs.repos = new Map([['default', mockRepo as unknown as SpecRepository]])
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

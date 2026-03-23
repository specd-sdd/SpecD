/* eslint-disable @typescript-eslint/unbound-method */

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
import { registerProjectContext } from '../../src/commands/project/context.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  vi.mocked(resolveCliContext).mockResolvedValue({ config, kernel })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Command signature', () => {
  it('--depth without --follow-deps', async () => {
    const { stderr } = setup()

    const program = makeProgram()
    registerProjectContext(program.command('project'))

    await expect(
      program.parseAsync(['node', 'specd', 'project', 'context', '--depth', '2']),
    ).rejects.toThrow(ExitSentinel)

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

describe('Behaviour', () => {
  it('Context entries rendered first', async () => {
    const { config, kernel, stdout } = setup()
    Object.assign(config, {
      context: [{ instruction: 'Follow conventions.' }],
      contextIncludeSpecs: ['*'],
    })
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: ['Follow conventions.'],
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Auth Login',
          description: 'Login spec',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Spec content here',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    const out = stdout()
    const instructionIdx = out.indexOf('Follow conventions.')
    const specIdx = out.indexOf('Spec content here')
    expect(instructionIdx).toBeGreaterThanOrEqual(0)
    expect(specIdx).toBeGreaterThan(instructionIdx)
  })

  it('Include patterns applied across all workspaces', async () => {
    const { config, kernel, stdout } = setup()
    Object.assign(config, {
      contextIncludeSpecs: ['*'],
    })
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [
        {
          specId: 'ws-a:foo/bar',
          title: 'Foo Bar',
          description: '',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Content from ws-a',
        },
        {
          specId: 'ws-b:baz/qux',
          title: 'Baz Qux',
          description: '',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Content from ws-b',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    const out = stdout()
    expect(out).toContain('Content from ws-a')
    expect(out).toContain('Content from ws-b')
  })

  it('Exclude patterns remove specs from the set', async () => {
    const { config, kernel } = setup()
    Object.assign(config, {
      contextIncludeSpecs: ['*'],
      contextExcludeSpecs: ['auth/*'],
    })
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [
        {
          specId: 'default:billing/pay',
          title: 'Billing Pay',
          description: '',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Billing content',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    expect(kernel.project.getProjectContext.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          contextExcludeSpecs: ['auth/*'],
        }),
      }),
    )
  })

  it('Workspace-level patterns not applied', async () => {
    const { config, kernel, stdout } = setup()
    Object.assign(config, {
      contextIncludeSpecs: ['default:*'],
    })
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    expect(kernel.project.getProjectContext.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        config: expect.objectContaining({
          contextIncludeSpecs: ['default:*'],
        }),
      }),
    )
    expect(stdout()).not.toContain('billing')
  })

  it('dependsOn traversal not performed by default', async () => {
    const { kernel } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Auth Login',
          description: '',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Login spec',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    const callArgs = kernel.project.getProjectContext.execute.mock.calls[0]![0]
    expect(callArgs).not.toHaveProperty('followDeps')
  })

  it('--follow-deps includes transitive dependencies', async () => {
    const { kernel } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Auth Login',
          description: '',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Login spec',
        },
        {
          specId: 'default:auth/session',
          title: 'Auth Session',
          description: '',
          source: 'dependsOnTraversal' as const,
          mode: 'summary' as const,
          content: 'Session spec',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context', '--follow-deps'])

    expect(kernel.project.getProjectContext.execute).toHaveBeenCalledWith(
      expect.objectContaining({ followDeps: true }),
    )
  })

  it('--depth limits traversal', async () => {
    const { kernel } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync([
      'node',
      'specd',
      'project',
      'context',
      '--follow-deps',
      '--depth',
      '1',
    ])

    expect(kernel.project.getProjectContext.execute).toHaveBeenCalledWith(
      expect.objectContaining({ followDeps: true, depth: 1 }),
    )
  })

  it('Section flags filter spec content', async () => {
    const { kernel } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Auth Login',
          description: '',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Rules only',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context', '--rules'])

    expect(kernel.project.getProjectContext.execute).toHaveBeenCalledWith(
      expect.objectContaining({ sections: ['rules'] }),
    )
  })

  it('Section flags do not affect context entries', async () => {
    const { config, kernel, stdout } = setup()
    Object.assign(config, {
      context: [{ instruction: 'Follow conventions.' }],
    })
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: ['Follow conventions.'],
      specs: [],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context', '--rules'])

    expect(stdout()).toContain('Follow conventions.')
  })

  it('File context entry resolved', async () => {
    const { config, kernel, stdout } = setup()
    Object.assign(config, {
      context: [{ file: 'docs/context.md' }],
    })
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: ['Hello world'],
      specs: [],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    expect(stdout()).toContain('Hello world')
  })
})

describe('Output', () => {
  it('Nothing configured', async () => {
    const { kernel, stdout } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    expect(stdout()).toContain('no project context configured')
  })

  it('JSON output structure', async () => {
    const { config, kernel, stdout } = setup()
    Object.assign(config, {
      context: [{ instruction: 'Follow conventions.' }],
      contextIncludeSpecs: ['*'],
    })
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: ['Follow conventions.'],
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Auth Login',
          description: '',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Login spec content',
        },
      ],
      warnings: [],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.contextEntries).toContain('Follow conventions.')
    expect(Array.isArray(parsed.specs)).toBe(true)
    expect(parsed.specs).toHaveLength(1)
    expect(parsed.specs[0]).toHaveProperty('specId')
    expect(parsed.specs[0]).toHaveProperty('title')
    expect(parsed.specs[0]).toHaveProperty('description')
    expect(parsed.specs[0]).toHaveProperty('source')
    expect(parsed.specs[0]).toHaveProperty('mode')
    expect(parsed.specs[0]).toHaveProperty('content')
    expect(parsed).toHaveProperty('warnings')
  })
})

describe('Warnings', () => {
  it('Missing file entry emits warning', async () => {
    const { config, kernel, stderr } = setup()
    Object.assign(config, {
      context: [{ file: 'missing.md' }],
    })
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [],
      warnings: [{ message: 'file not found: missing.md' }],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    expect(stderr()).toMatch(/warning:/)
    expect(stderr()).toContain('missing.md')
  })

  it('Stale metadata emits warning', async () => {
    const { kernel, stderr, stdout } = setup()
    kernel.project.getProjectContext.execute.mockResolvedValue({
      contextEntries: [],
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Auth Login',
          description: '',
          source: 'includePattern' as const,
          mode: 'full' as const,
          content: 'Fallback content',
        },
      ],
      warnings: [{ message: 'stale metadata for auth/login' }],
    })

    const program = makeProgram()
    registerProjectContext(program.command('project'))
    await program.parseAsync(['node', 'specd', 'project', 'context'])

    expect(stderr()).toMatch(/warning:/)
    expect(stdout()).toContain('Fallback content')
  })
})

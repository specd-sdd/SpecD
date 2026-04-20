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

vi.mock('../../src/load-config.js', () => ({
  loadConfig: vi.fn(),
  resolveConfigPath: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../src/kernel.js', () => ({ createCliKernel: vi.fn() }))

import { loadConfig } from '../../src/load-config.js'
import { createCliKernel } from '../../src/kernel.js'
import { registerChangeContext } from '../../src/commands/change/context.js'

const mockResult = {
  contextFingerprint: 'sha256:test-context',
  status: 'changed' as const,
  projectContext: [
    { source: 'instruction' as const, content: '# Designing step instructions\n\nDo this.' },
  ],
  specs: [
    {
      specId: 'default:auth/login',
      title: 'Auth Login',
      description: 'Login spec',
      source: 'includePattern' as const,
      mode: 'full' as const,
      content: '#### Rules\n\n##### Auth rule\n- Users must authenticate',
    },
  ],
  availableSteps: [{ step: 'designing', available: true, blockingArtifacts: [] as string[] }],
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
        specsAdapter: { adapter: 'fs', config: { path: '/project/specs' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/project',
        ownership: 'owned' as const,
        isExternal: false,
      },
    ],
  })
  const kernel = makeMockKernel()
  vi.mocked(loadConfig).mockResolvedValue(config)
  vi.mocked(createCliKernel).mockResolvedValue(kernel)
  kernel.changes.compile.execute.mockResolvedValue({ ...mockResult })
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, kernel, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('change context', () => {
  it('prints project context and spec content in text format', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'context', 'my-change', 'designing'])

    expect(stdout().startsWith('Context Fingerprint: sha256:test-context')).toBe(true)
    expect(stdout()).toContain('# Designing step instructions')
    expect(stdout()).toContain('Do this.')
    expect(stdout()).toContain('### Spec: default:auth/login')
    expect(stdout()).toContain('Mode: full')
  })

  it('outputs JSON with structured result fields', async () => {
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
    expect(parsed.contextFingerprint).toBe('sha256:test-context')
    expect(parsed.status).toBe('changed')
    expect(parsed.stepAvailable).toBe(true)
    expect(Array.isArray(parsed.projectContext)).toBe(true)
    expect(Array.isArray(parsed.specs)).toBe(true)
    expect(Array.isArray(parsed.availableSteps)).toBe(true)
    expect(Array.isArray(parsed.warnings)).toBe(true)
    expect(parsed.specs[0].specId).toBe('default:auth/login')
    expect(parsed.specs[0].mode).toBe('full')
  })

  it('prints fingerprint first and unchanged message when fingerprint matches in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.compile.execute.mockResolvedValue({
      ...mockResult,
      status: 'unchanged' as const,
      projectContext: [],
      specs: [],
    })

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'context',
      'my-change',
      'designing',
      '--fingerprint',
      'sha256:test-context',
    ])

    expect(stdout()).toBe(
      'Context Fingerprint: sha256:test-context\n\nContext unchanged since last call.\n',
    )
  })

  it('outputs unchanged JSON as direct structured passthrough', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.compile.execute.mockResolvedValue({
      ...mockResult,
      status: 'unchanged' as const,
      projectContext: [],
      specs: [],
    })

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync([
      'node',
      'specd',
      'change',
      'context',
      'my-change',
      'designing',
      '--fingerprint',
      'sha256:test-context',
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(parsed.contextFingerprint).toBe('sha256:test-context')
    expect(parsed.status).toBe('unchanged')
    expect(parsed.projectContext).toEqual([])
    expect(parsed.specs).toEqual([])
    expect(parsed.availableSteps).toEqual(mockResult.availableSteps)
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

  it('does not print a warning line for pure cycle traversal suppression', async () => {
    const { kernel, stderr } = setup()
    kernel.changes.compile.execute.mockResolvedValue({
      ...mockResult,
      warnings: [],
    })

    const program = makeProgram()
    registerChangeContext(program.command('change'))
    await program.parseAsync(['node', 'specd', 'change', 'context', 'my-change', 'designing'])

    expect(stderr()).not.toContain('cycle')
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

  it('renders summary specs as catalogue in summary mode', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.compile.execute.mockResolvedValue({
      ...mockResult,
      specs: [
        {
          specId: 'default:auth/login',
          title: 'Auth Login',
          description: 'Login spec',
          source: 'specIds' as const,
          mode: 'full' as const,
          content: 'Full content here',
        },
        {
          specId: 'default:_global/architecture',
          title: 'Architecture',
          description: 'Hexagonal architecture',
          source: 'includePattern' as const,
          mode: 'summary' as const,
        },
      ],
    })

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
      'text',
    ])

    expect(stdout()).toContain('## Available context specs')
    expect(stdout()).toContain('specd change spec-preview')
    expect(stdout()).toContain('Architecture')
    expect(stdout()).toContain('Hexagonal architecture')
    expect(stdout()).toContain('| default:_global/architecture | summary |')
  })

  it('renders dependsOnTraversal summary specs under Via dependencies heading', async () => {
    const { kernel, stdout } = setup()
    kernel.changes.compile.execute.mockResolvedValue({
      ...mockResult,
      specs: [
        {
          specId: 'default:infra/database',
          title: 'Database',
          description: 'Database layer',
          source: 'dependsOnTraversal' as const,
          mode: 'summary' as const,
        },
      ],
    })

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
      'text',
    ])

    expect(stdout()).toContain('### Via dependencies')
    expect(stdout()).toContain('Database')
    expect(stdout()).toContain('Database layer')
    expect(stdout()).toContain('| default:infra/database | summary |')
  })

  it('JSON output includes projectContext, specs, availableSteps with mode and source', async () => {
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
    expect(parsed.projectContext).toBeDefined()
    expect(parsed.specs).toBeDefined()
    expect(parsed.availableSteps).toBeDefined()
    expect(parsed.specs[0].mode).toBe('full')
    expect(parsed.specs[0].source).toBe('includePattern')
    expect(parsed.warnings).toEqual([])
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

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeMockKernel,
  makeListSpecsResult,
  makeProgram,
  captureStdout,
  captureStderr,
  mockProcessExit,
  DEFAULT_LIST_LIMIT,
} from './helpers.js'

function makeMultiWorkspaceConfig() {
  return makeMockConfig({
    workspaces: [
      {
        name: 'alpha',
        specsPath: '/project/specs-alpha',
        specsAdapter: { adapter: 'fs', config: { path: '/project/specs-alpha' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/project',
        ownership: 'owned' as const,
        isExternal: false,
      },
      {
        name: 'beta',
        specsPath: '/project/specs-beta',
        specsAdapter: { adapter: 'fs', config: { path: '/project/specs-beta' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/project',
        ownership: 'owned' as const,
        isExternal: false,
      },
    ],
  })
}

const multiEntries = [
  { workspace: 'alpha', path: 'auth/login', title: 'Login' },
  { workspace: 'beta', path: 'billing/pay', title: 'Pay' },
]

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
  buildCliKernelOptions: vi.fn(() => ({})),
}))

import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { registerSpecList } from '../../src/commands/spec/list.js'

function setup() {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  kernel.project.listWorkspaces.execute.mockResolvedValue([
    {
      name: 'default',
      codeRoot: '/project',
      isExternal: false,
      ownership: 'owned',
      specRepo: { count: vi.fn().mockResolvedValue(3) },
    },
  ])
  vi.mocked(resolveCliContext).mockResolvedValue({
    config: config,
    configFilePath: null,
    kernel: kernel,
  })
  const stdout = captureStdout()
  return { config, kernel, stdout }
}

afterEach(() => vi.restoreAllMocks())

const entries = [
  { workspace: 'default', path: 'auth/login', title: 'Login', metadataStatus: 'fresh' as const },
  {
    workspace: 'default',
    path: 'auth/register',
    title: 'Register',
    metadataStatus: 'stale' as const,
  },
  {
    workspace: 'default',
    path: 'billing/invoices',
    title: 'Invoices',
    metadataStatus: 'missing' as const,
  },
]

describe('spec list --metadata-status', () => {
  it('shows STATUS column in text mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult(entries))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--metadata-status'])

    const out = stdout()
    expect(out).toContain('METADATA STATUS')
    expect(out).toContain('fresh')
    expect(out).toContain('stale')
    expect(out).toContain('missing')
  })

  it('passes includeMetadataStatus true to use case when --metadata-status is present', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([]))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--metadata-status'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeMetadataStatus: true,
    })
  })

  it('does not pass includeMetadataStatus when --metadata-status is absent', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([]))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeMetadataStatus: false,
    })
  })

  it('filters by single status value', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult(entries))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--metadata-status', 'stale'])

    const out = stdout()
    expect(out).toContain('Register')
    expect(out).toContain('stale')
    expect(out).not.toContain('Login')
    expect(out).not.toContain('Invoices')
  })

  it('filters by comma-separated status values', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult(entries))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'list',
      '--metadata-status',
      'stale,missing',
    ])

    const out = stdout()
    expect(out).toContain('Register')
    expect(out).toContain('Invoices')
    expect(out).not.toContain('Login')
  })

  it('includes status in JSON output', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult(entries))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'list',
      '--metadata-status',
      '--format',
      'json',
    ])

    const json = JSON.parse(stdout())
    const specs = json.workspaces[0].specs
    expect(specs[0].metadataStatus).toBe('fresh')
    expect(specs[1].metadataStatus).toBe('stale')
    expect(specs[2].metadataStatus).toBe('missing')
  })

  it('omits status from JSON when --metadata-status is not passed', async () => {
    const { kernel, stdout } = setup()
    const noStatusEntries = entries.map(({ metadataStatus: _, ...rest }) => rest)
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult(noStatusEntries))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--format', 'json'])

    const json = JSON.parse(stdout())
    const specs = json.workspaces[0].specs
    expect(specs[0]).not.toHaveProperty('metadataStatus')
  })

  it('does not show STATUS column when --metadata-status is absent', async () => {
    const { kernel, stdout } = setup()
    const noStatusEntries = entries.map(({ metadataStatus: _, ...rest }) => rest)
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult(noStatusEntries))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    const out = stdout()
    expect(out).not.toContain('METADATA STATUS')
  })

  it('uses optimizedDescription when available in summary mode', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(
      makeListSpecsResult([
        {
          workspace: 'default',
          path: 'auth/login',
          title: 'Login',
          summary: 'Terse login summary',
        },
      ]),
    )

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--summary'])

    expect(stdout()).toContain('Terse login summary')
  })
})

describe('spec list --workspace', () => {
  it('passes workspace filter to use case', async () => {
    const config = makeMultiWorkspaceConfig()
    const kernel = makeMockKernel()
    kernel.project.listWorkspaces.execute.mockResolvedValue([
      {
        name: 'alpha',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: vi.fn().mockResolvedValue(0) },
      },
      {
        name: 'beta',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: vi.fn().mockResolvedValue(0) },
      },
    ])
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: config,
      configFilePath: null,
      kernel: kernel,
    })
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([]))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--workspace', 'alpha'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeMetadataStatus: false,
      workspaces: ['alpha'],
    })
  })

  it('passes multiple workspace filters to use case', async () => {
    const config = makeMultiWorkspaceConfig()
    const kernel = makeMockKernel()
    kernel.project.listWorkspaces.execute.mockResolvedValue([
      {
        name: 'alpha',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: vi.fn().mockResolvedValue(0) },
      },
      {
        name: 'beta',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: vi.fn().mockResolvedValue(0) },
      },
    ])
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: config,
      configFilePath: null,
      kernel: kernel,
    })
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([]))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'list',
      '--workspace',
      'alpha',
      '--workspace',
      'beta',
    ])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeMetadataStatus: false,
      workspaces: ['alpha', 'beta'],
    })
  })

  it('shows only filtered workspace in text output', async () => {
    const config = makeMultiWorkspaceConfig()
    const kernel = makeMockKernel()
    kernel.project.listWorkspaces.execute.mockResolvedValue([
      {
        name: 'alpha',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: vi.fn().mockResolvedValue(1) },
      },
      {
        name: 'beta',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: vi.fn().mockResolvedValue(1) },
      },
    ])
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: config,
      configFilePath: null,
      kernel: kernel,
    })
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([multiEntries[0]!]))

    const stdout = captureStdout()
    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--workspace', 'alpha'])

    const out = stdout()
    expect(out).toContain('alpha')
    expect(out).toContain('Login')
    expect(out).not.toContain('beta')
  })

  it('includes only filtered workspaces in JSON output', async () => {
    const config = makeMultiWorkspaceConfig()
    const kernel = makeMockKernel()
    kernel.project.listWorkspaces.execute.mockResolvedValue([
      {
        name: 'alpha',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: vi.fn().mockResolvedValue(1) },
      },
      {
        name: 'beta',
        codeRoot: '/project',
        isExternal: false,
        ownership: 'owned',
        specRepo: { count: vi.fn().mockResolvedValue(1) },
      },
    ])
    vi.mocked(resolveCliContext).mockResolvedValue({
      config: config,
      configFilePath: null,
      kernel: kernel,
    })
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([multiEntries[0]!]))

    const stdout = captureStdout()
    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync([
      'node',
      'specd',
      'spec',
      'list',
      '--workspace',
      'alpha',
      '--format',
      'json',
    ])

    const json = JSON.parse(stdout())
    expect(json.workspaces).toHaveLength(1)
    expect(json.workspaces[0].name).toBe('alpha')
  })

  it('omits workspaces property when no --workspace is provided', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([]))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeMetadataStatus: false,
    })
  })
})

describe('spec list pagination', () => {
  it('forwards --limit and --page to ListSpecs', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([]))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--limit', '50', '--page', '3'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      limit: 50,
      page: 3,
      includeSummary: false,
      includeMetadataStatus: false,
    })
  })

  it('forwards --after-key without --after-id', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([]))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--after-key', 'auth/login'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      after: { key: 'auth/login' },
      includeSummary: false,
      includeMetadataStatus: false,
    })
  })

  it('rejects --after-id for spec list', async () => {
    const program = makeProgram()
    registerSpecList(program.command('spec'))
    const cmd = program.commands
      .find((c) => c.name() === 'spec')!
      .commands.find((c) => c.name() === 'list')!
    const optionNames = cmd.options.map((o) => o.long?.replace(/^--/, '') ?? o.short)
    expect(optionNames).not.toContain('after-id')
  })

  it('prints per-workspace truncation hint when numeric --limit truncates', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(
      makeListSpecsResult([{ workspace: 'default', path: 'auth/login', title: 'Login' }], {
        total: 500,
        count: 1,
      }),
    )

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--limit', '1'])

    expect(stdout()).toContain('showing 1 of 500 (use --limit/--page)')
  })

  it('does not print truncation hint when --limit is omitted', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(
      makeListSpecsResult([{ workspace: 'default', path: 'auth/login', title: 'Login' }], {
        total: 500,
        count: 1,
      }),
    )

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list'])

    expect(stdout()).not.toContain('showing')
  })

  it('JSON workspaces include meta from use case without host default', async () => {
    const { kernel, stdout } = setup()
    kernel.specs.list.execute.mockResolvedValue(
      makeListSpecsResult([{ workspace: 'default', path: 'auth/login', title: 'Login' }], {
        total: 1,
        count: 1,
        limit: 1,
      }),
    )

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--format', 'json'])

    const json = JSON.parse(stdout())
    expect(json.workspaces[0].meta.limit).toBe(1)
    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeMetadataStatus: false,
    })
  })

  it('forwards --limit all without limit to ListSpecs', async () => {
    const { kernel } = setup()
    kernel.specs.list.execute.mockResolvedValue(makeListSpecsResult([]))

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--limit', 'all'])

    expect(kernel.specs.list.execute).toHaveBeenCalledWith({
      includeSummary: false,
      includeMetadataStatus: false,
    })
  })

  it('rejects --page without numeric --limit', async () => {
    mockProcessExit()
    const stderr = captureStderr()
    const { kernel } = setup()

    const program = makeProgram()
    registerSpecList(program.command('spec'))
    await program.parseAsync(['node', 'specd', 'spec', 'list', '--page', '2']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/--page requires a numeric --limit/)
    expect(kernel.specs.list.execute).not.toHaveBeenCalled()
  })
})

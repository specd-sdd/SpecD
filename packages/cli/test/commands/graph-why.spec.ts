import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  ExitSentinel,
  makeMockConfig,
  makeMockKernel,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('../../src/commands/graph/resolve-graph-cli-context.js', () => ({
  resolveGraphCliContext: vi.fn(),
}))

vi.mock('../../src/commands/graph/with-provider.js', () => ({
  withProvider: vi.fn(),
}))

import { type RunGraphWhyResult } from '@specd/sdk'
import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { registerGraphWhy, renderGraphWhyText } from '../../src/commands/graph/why.js'

const EXCLUDED: RunGraphWhyResult = {
  input: 'app/vendors/iccms/a.ts',
  projectRelativePath: 'app/vendors/iccms/a.ts',
  verdict: 'not-indexed',
  owners: [],
  diagnostics: [],
  candidates: [
    {
      workspace: 'backend',
      identity: 'backend:vendors/iccms/a.ts',
      verdict: 'excluded',
      category: null,
      kind: null,
      inGraph: false,
      steps: [
        { stage: 'binary-extension', outcome: 'passed' },
        { stage: 'gitignore', outcome: 'not-applicable' },
        {
          stage: 'global-exclude',
          outcome: 'matched',
          rule: {
            pattern: 'app/vendors/*',
            negated: false,
            origin: { layer: 'global', key: 'graph.excludePaths' },
          },
          detail: { workspaceNegationBlocked: true },
        },
        { stage: 'workspace-exclude', outcome: 'not-applicable' },
        { stage: 'allowed-paths', outcome: 'not-applicable' },
        { stage: 'size-limit', outcome: 'not-applicable' },
        { stage: 'category', outcome: 'not-applicable' },
        { stage: 'adapter', outcome: 'not-applicable' },
      ],
    },
  ],
}

const INDEXABLE: RunGraphWhyResult = {
  input: 'app/webroot/a.ts',
  projectRelativePath: 'app/webroot/a.ts',
  verdict: 'indexable',
  owners: ['backend', 'backoffice'],
  diagnostics: [
    {
      code: 'MULTIPLE_OWNERS',
      message: 'The same file is indexed by workspaces backend, backoffice',
    },
  ],
  candidates: ['backend', 'backoffice'].map((workspace) => ({
    workspace,
    identity: `${workspace}:a.ts`,
    verdict: 'indexable' as const,
    category: 'source' as const,
    kind: 'file' as const,
    inGraph: true,
    steps: [
      {
        stage: 'gitignore' as const,
        outcome: 'matched' as const,
        rule: {
          pattern: 'a.log',
          negated: false,
          origin: { layer: 'gitignore' as const, sourceFile: 'app/.gitignore', line: 4 },
        },
      },
      {
        stage: 'adapter' as const,
        outcome: 'passed' as const,
        detail: { kind: 'file' as const, language: 'typescript' },
      },
    ],
  })),
}

function setup(result: RunGraphWhyResult = EXCLUDED, reasonCodes: string[] = []) {
  const config = makeMockConfig()
  const kernel = makeMockKernel()
  kernel.project.getConfig.execute.mockReturnValue(config)
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode: 'configured',
    config,
    configFilePath: '/project/specd.yaml',
    kernel,
    projectRoot: '/project',
    vcsRoot: '/project',
  })
  const provider = {
    explainPath: vi.fn().mockResolvedValue(result),
    getGraphHealth: vi.fn().mockResolvedValue({ reasonCodes }),
  }
  vi.mocked(withProvider).mockImplementation(async (_config, _format, fn) => {
    await fn(provider as never)
  })
  const getStdout = captureStdout()
  const getStderr = captureStderr()
  mockProcessExit()
  return { provider, getStdout, getStderr }
}

function makeWhyProgram() {
  const program = makeProgram()
  registerGraphWhy(program.command('graph'))
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph why', () => {
  it('requires a path argument', async () => {
    setup()
    await expect(makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why'])).rejects.toThrow(
      /missing required argument/,
    )
  })

  it('rejects --config together with --path', async () => {
    setup()
    await expect(
      makeWhyProgram().parseAsync([
        'node',
        'specd',
        'graph',
        'why',
        'a.ts',
        '--config',
        'x',
        '--path',
        'y',
      ]),
    ).rejects.toBeInstanceOf(ExitSentinel)
  })

  it('passes config and path options to the graph context', async () => {
    setup()
    await makeWhyProgram().parseAsync([
      'node',
      'specd',
      'graph',
      'why',
      'a.ts',
      '--config',
      '/x/specd.yaml',
    ])
    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: '/x/specd.yaml',
      repoPath: undefined,
    })
  })

  it('asks the provider to explain the given path', async () => {
    const { provider } = setup()
    await makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', 'workspace:src/a.ts'])
    expect(provider.explainPath).toHaveBeenCalledWith('workspace:src/a.ts')
  })

  it('passes an absolute path through unchanged', async () => {
    const { provider } = setup()
    await makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', '/project/src/a.ts'])
    expect(provider.explainPath).toHaveBeenCalledWith('/project/src/a.ts')
  })

  it('passes the bootstrap path option to the graph context', async () => {
    setup()
    await makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', 'a.ts', '--path', '/repo'])
    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: '/repo',
    })
  })

  it('prints json equal to the SDK result', async () => {
    const { getStdout } = setup(INDEXABLE)
    await makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', 'a.ts', '--format', 'json'])
    expect(JSON.parse(getStdout())).toEqual(INDEXABLE)
  })

  it('prints toon carrying the same data', async () => {
    const { getStdout } = setup(INDEXABLE)
    await makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', 'a.ts', '--format', 'toon'])
    expect(getStdout()).toContain('MULTIPLE_OWNERS')
    expect(getStdout()).toContain('backoffice:a.ts')
  })

  it('completes without exiting non-zero for an excluded path', async () => {
    setup(EXCLUDED)
    await expect(
      makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', 'a.ts']),
    ).resolves.toBeDefined()
    expect(process.exit).not.toHaveBeenCalled()
  })

  it('propagates provider errors such as UNKNOWN_WORKSPACE', async () => {
    const { provider } = setup()
    provider.explainPath.mockRejectedValue(
      Object.assign(new Error("Unknown workspace 'nope'"), { code: 'UNKNOWN_WORKSPACE' }),
    )
    await expect(
      makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', 'nope:src/a.ts']),
    ).rejects.toMatchObject({ code: 'UNKNOWN_WORKSPACE' })
  })

  it('fails through the standard error contract when the context cannot be resolved', async () => {
    setup()
    vi.mocked(resolveGraphCliContext).mockRejectedValue(new Error('no specd.yaml'))
    await expect(
      makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', 'a.ts']),
    ).rejects.toBeInstanceOf(ExitSentinel)
  })

  it('prints the usual staleness notice without changing the explanation', async () => {
    const { getStderr, getStdout } = setup(EXCLUDED, ['VCS_REF_STALE'])
    await makeWhyProgram().parseAsync(['node', 'specd', 'graph', 'why', 'a.ts'])
    expect(getStderr()).toContain('Graph health: VCS_REF_STALE')
    expect(getStdout()).toContain('verdict: not-indexed')
  })

  it('is a thin presenter that imports @specd/sdk and not code-graph or core', () => {
    const source = readFileSync(new URL('../../src/commands/graph/why.ts', import.meta.url), 'utf8')
    expect(source).toContain("from '@specd/sdk'")
    expect(source).not.toContain("from '@specd/code-graph'")
    expect(source).not.toContain("from '@specd/core'")
  })
})

describe('renderGraphWhyText', () => {
  it('shows verdict, matched pattern, layer and key for an excluded path', () => {
    const text = renderGraphWhyText(EXCLUDED)
    expect(text).toContain('app/vendors/iccms/a.ts')
    expect(text).toContain('verdict: not-indexed   owners: none')
    expect(text).toContain(
      'global-exclude: matched — app/vendors/* (pattern) from global graph.excludePaths',
    )
  })

  it('states that a global exclusion prevented a workspace re-inclusion', () => {
    expect(renderGraphWhyText(EXCLUDED)).toContain(
      'a global exclusion prevented a workspace pattern from re-including this path',
    )
  })

  it('shows both owners with equal prominence and the MULTIPLE_OWNERS diagnostic', () => {
    const text = renderGraphWhyText(INDEXABLE)
    expect(text).toContain('owners: backend, backoffice')
    expect(text).toContain('backend:a.ts  [indexable]  category: source  kind: file  inGraph: yes')
    expect(text).toContain(
      'backoffice:a.ts  [indexable]  category: source  kind: file  inGraph: yes',
    )
    expect(text).toContain('! MULTIPLE_OWNERS:')
  })

  it('labels a negation rule and renders inGraph for every value', () => {
    const base = INDEXABLE.candidates[0]!
    const text = renderGraphWhyText({
      ...INDEXABLE,
      candidates: [
        {
          ...base,
          inGraph: null,
          steps: [
            {
              stage: 'workspace-exclude',
              outcome: 'matched',
              rule: {
                pattern: '!gen/keep.ts',
                negated: true,
                origin: { layer: 'workspace', workspace: 'backend', key: 'k' },
              },
            },
          ],
        },
        { ...base, identity: 'x:y', inGraph: false, steps: [] },
      ],
    })
    expect(text).toContain('!gen/keep.ts (negation) from workspace backend k')
    expect(text).toContain('inGraph: unknown')
    expect(text).toContain('inGraph: no')
  })

  it('renders an exemption and the ancestor directory that excluded a path', () => {
    const base = INDEXABLE.candidates[0]!
    const text = renderGraphWhyText({
      ...INDEXABLE,
      candidates: [
        {
          ...base,
          steps: [
            {
              stage: 'global-exclude',
              outcome: 'matched',
              rule: {
                pattern: 'tmp/',
                negated: false,
                origin: { layer: 'global', key: 'graph.excludePaths' },
                viaDirectory: 'app/tmp',
              },
            },
            {
              stage: 'size-limit',
              outcome: 'matched',
              rule: {
                pattern: 'gen/**',
                negated: false,
                origin: { layer: 'global', key: 'graph.largeFilePaths' },
              },
              detail: { sizeBytes: 400000, limitBytes: 262144, exempt: true },
            },
          ],
        },
      ],
    })
    expect(text).toContain('from global graph.excludePaths via app/tmp')
    expect(text).toContain('size=400000 limit=262144 exempt')
  })

  it('prints diagnostics after all candidates', () => {
    const text = renderGraphWhyText(INDEXABLE)
    expect(text.lastIndexOf('! MULTIPLE_OWNERS')).toBeGreaterThan(
      text.lastIndexOf('backoffice:a.ts'),
    )
    expect(text.indexOf('! MULTIPLE_OWNERS')).toBeGreaterThan(text.indexOf('backend:a.ts'))
  })

  it('renders not-in-scope without candidates and a size-limit step with its numbers', () => {
    const notInScope = renderGraphWhyText({
      input: 'x',
      projectRelativePath: 'x',
      verdict: 'not-in-scope',
      owners: [],
      candidates: [],
      diagnostics: [],
    })
    expect(notInScope).toContain('verdict: not-in-scope   owners: none')

    const base = INDEXABLE.candidates[0]!
    const text = renderGraphWhyText({
      ...INDEXABLE,
      candidates: [
        {
          ...base,
          verdict: 'too-large',
          steps: [
            {
              stage: 'size-limit',
              outcome: 'matched',
              detail: { sizeBytes: 300000, limitBytes: 262144, exempt: false },
            },
          ],
        },
      ],
    })
    expect(text).toContain('[too-large]')
    expect(text).toContain('size-limit: matched size=300000 limit=262144')
  })

  it('shows the .gitignore file and line', () => {
    expect(renderGraphWhyText(INDEXABLE)).toContain('from gitignore app/.gitignore:4')
  })

  it('shows category, node kind and passed steps for an indexable path', () => {
    const text = renderGraphWhyText(INDEXABLE)
    expect(text).toContain('adapter: passed kind=file language=typescript')
  })
})

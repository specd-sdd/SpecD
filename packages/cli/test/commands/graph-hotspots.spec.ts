import { readFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureStderr,
  captureStdout,
  makeMockConfig,
  makeProgram,
  mockProcessExit,
} from './helpers.js'

vi.mock('../../src/commands/graph/resolve-graph-cli-context.js', () => ({
  resolveGraphCliContext: vi.fn(),
}))

vi.mock('../../src/commands/graph/with-provider.js', () => ({
  withProvider: vi.fn(),
}))

import { resolveGraphCliContext } from '../../src/commands/graph/resolve-graph-cli-context.js'
import { withProvider } from '../../src/commands/graph/with-provider.js'
import { registerGraphHotspots } from '../../src/commands/graph/hotspots.js'

function setup() {
  const config = makeMockConfig()
  vi.mocked(resolveGraphCliContext).mockResolvedValue({
    mode: 'configured',
    config,
    configFilePath: '/project/specd.yaml',
    kernel: null,
    projectRoot: '/project',
    vcsRoot: '/project',
  })

  const mockProvider = {
    getHotspots: vi.fn().mockResolvedValue({
      totalSymbols: 0,
      entries: [],
    }),
  }
  vi.mocked(withProvider).mockImplementation(async (_config, _format, fn) => {
    await fn(mockProvider as never)
  })

  const getStdout = captureStdout()
  const getStderr = captureStderr()
  mockProcessExit()
  return { mockProvider, getStdout, getStderr }
}

function makeHotspotsProgram() {
  const program = makeProgram()
  const graph = program.command('graph')
  registerGraphHotspots(graph)
  return program
}

afterEach(() => vi.restoreAllMocks())

describe('graph hotspots', () => {
  it('passes explicit config path to graph context resolution', async () => {
    setup()

    const program = makeHotspotsProgram()
    await program.parseAsync([
      'node',
      'specd',
      'graph',
      'hotspots',
      '--config',
      '/tmp/other/specd.yaml',
    ])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: '/tmp/other/specd.yaml',
      repoPath: undefined,
    })
  })

  it('passes explicit bootstrap path to graph context resolution', async () => {
    setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--path', '/tmp/repo'])

    expect(resolveGraphCliContext).toHaveBeenCalledWith({
      configPath: undefined,
      repoPath: '/tmp/repo',
    })
  })

  it('keeps implicit defaults when no explicit filter is provided', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith({})
  })

  it('lets an explicit limit override only the limit', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--limit', '50'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith({ limit: 50 })
  })

  it('passes all parsed kinds to hotspot retrieval', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--kind', 'class,method'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: ['class', 'method'],
      }),
    )
  })

  it('lets an explicit --kind replace the default kind set', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--kind', 'interface'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith(
      expect.objectContaining({
        kinds: ['interface'],
      }),
    )
  })

  it('lets an explicit min-risk override only the risk threshold', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--min-risk', 'HIGH'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith({ minRisk: 'HIGH' })
  })

  it('lets min-score override only the score threshold', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--min-score', '0'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith({ minScore: 0 })
  })

  it('widens the query only when include-importer-only is explicit', async () => {
    const { mockProvider } = setup()

    const program = makeHotspotsProgram()
    await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--include-importer-only'])

    expect(mockProvider.getHotspots).toHaveBeenCalledWith({ includeImporterOnly: true })
  })

  it('rejects invalid kind values before querying', async () => {
    const { getStderr, mockProvider } = setup()

    const program = makeHotspotsProgram()
    try {
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'hotspots',
        '--kind',
        'class,unknownKind',
      ])
    } catch {
      /* ExitSentinel */
    }

    expect(getStderr()).toContain("invalid --kind value 'unknownkind'")
    expect(mockProvider.getHotspots).not.toHaveBeenCalled()
  })

  it('rejects --config and --path together', async () => {
    const { getStderr } = setup()

    const program = makeHotspotsProgram()
    try {
      await program.parseAsync([
        'node',
        'specd',
        'graph',
        'hotspots',
        '--config',
        './specd.yaml',
        '--path',
        '.',
      ])
    } catch {
      /* ExitSentinel */
    }

    expect(getStderr()).toContain('--config and --path are mutually exclusive')
  })

  it('documents default kind and importer-only behavior in help output', async () => {
    const { getStdout } = setup()

    const program = makeHotspotsProgram()
    try {
      await program.parseAsync(['node', 'specd', 'graph', 'hotspots', '--help'])
    } catch {
      /* Commander exit override */
    }

    const help = getStdout()
    expect(help).toContain('Defaults (no flags): kinds class,method,function')
    expect(help).toContain('Default view excludes importer-only symbols unless widened with')
    expect(help).toContain('--include-importer-only')
    expect(help).toContain('Passing --kind replaces the default kind set')
    expect(help).toContain('Each option overrides only its own default')
  })

  it('keeps the CLI reference aligned with hotspot default kind semantics', async () => {
    const docs = await readFile('../../docs/cli/cli-reference.md', 'utf8')

    expect(docs).toContain(
      'By default, `graph hotspots` shows only `class`, `method`, and `function` symbols',
    )
    expect(docs).toContain('When you pass `--kind`, that list fully replaces the default kind set')
    expect(docs).toContain(
      'Use `--include-importer-only` when you explicitly want importer-only symbols to appear',
    )
    expect(docs).toContain(
      'Overriding `--min-risk`, `--limit`, or `--min-score` does not disable the other defaults',
    )
  })
})

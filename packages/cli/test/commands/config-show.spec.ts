import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest'
import {
  makeMockConfig,
  makeProgram,
  mockProcessExit,
  captureStdout,
  captureStderr,
} from './helpers.js'

vi.mock('../../src/helpers/cli-context.js', () => ({
  resolveCliContext: vi.fn(),
}))

vi.mock('../../src/load-config.js', () => ({
  loadConfig: vi.fn(),
  resolveConfigPath: vi.fn().mockResolvedValue(null),
}))

import { loadConfig } from '../../src/load-config.js'
import { resolveCliContext } from '../../src/helpers/cli-context.js'
import { decode as decodeToon } from '@toon-format/toon'
import {
  ConfigValidationError,
  type SpecdConfig,
  type SpecdContextEntry,
  type SpecdStorageConfig,
  type SpecdWorkspaceConfig,
} from '@specd/sdk'
import {
  type ConfigShapeKey,
  CONTEXT_ENTRY_KEYS,
  PROJECT_KEYS,
  STORAGE_KEYS,
  WORKSPACE_KEYS,
} from '../../src/commands/config/config-shape.js'
import { registerConfigShow } from '../../src/commands/config/show.js'

function setup() {
  const config = makeMockConfig()
  vi.mocked(loadConfig).mockResolvedValue(config)
  const stdout = captureStdout()
  const stderr = captureStderr()
  mockProcessExit()
  return { config, stdout, stderr }
}

afterEach(() => vi.restoreAllMocks())

describe('Output format', () => {
  it('Text output shows all sections', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('projectRoot:')
    expect(out).toContain('/project')
    expect(out).toContain('schemaRef:')
    expect(out).toContain('approvals:')
    expect(out).toContain('workspaces:')
    expect(out).toContain('storage:')
    // All paths are absolute (start with /)
    expect(out).toMatch(/\/project/)
    expect(out).toMatch(/\/project\/.specd\/changes/)
  })

  it('Approval gates shown correctly', async () => {
    const config = makeMockConfig({ approvals: { spec: true, signoff: false } })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('spec=true')
    expect(out).toContain('signoff=false')
  })

  it('JSON output is full SpecdConfig', async () => {
    const config = makeMockConfig({
      contextIncludeSpecs: ['default:*'],
      context: [{ file: 'AGENTS.md' }],
      llmOptimizedContext: true,
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.projectRoot).toBe('/project')
    expect(parsed.schemaRef).toBeDefined()
    expect(Array.isArray(parsed.workspaces)).toBe(true)
    expect(parsed.storage).toBeDefined()
    expect(parsed.approvals).toBeDefined()
    expect(parsed.contextIncludeSpecs).toEqual(['default:*'])
    expect(parsed.context).toEqual([{ file: 'AGENTS.md' }])
    expect(parsed.llmOptimizedContext).toBe(true)
    // All path values are absolute strings
    expect(parsed.projectRoot).toMatch(/^\//)
    expect(parsed.storage.changesPath).toMatch(/^\//)
  })

  it('Optional fields omitted when not set', async () => {
    const { stdout } = setup()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.context).toBeUndefined()
    expect(parsed.schemaOverrides).toBeUndefined()
    expect(parsed.schemaPlugins).toBeUndefined()
    expect(parsed.llmOptimizedContext).toBeUndefined()
    expect(parsed.plugins).toBeUndefined()
  })

  it('Workspace entries include all fields', async () => {
    const config = makeMockConfig({
      workspaces: [
        {
          name: 'core',
          specsPath: '/project/specs/core',
          specsAdapter: { adapter: 'fs', config: { path: '/project/specs/core' } },
          schemasPath: '/project/schemas',
          schemasAdapter: { adapter: 'fs', config: { path: '/project/schemas' } },
          codeRoot: '/project/packages/core',
          ownership: 'owned' as const,
          isExternal: false,
          prefix: 'core',
        },
      ],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'json'])

    const parsed = JSON.parse(stdout())
    expect(parsed.workspaces[0].schemasPath).toBe('/project/schemas')
    expect(parsed.workspaces[0].codeRoot).toBe('/project/packages/core')
    expect(parsed.workspaces[0].prefix).toBe('core')
  })

  it('Multiple workspaces listed', async () => {
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
          name: 'billing-ws',
          specsPath: '/project/billing/specs',
          specsAdapter: { adapter: 'fs', config: { path: '/project/billing/specs' } },
          schemasPath: null,
          schemasAdapter: null,
          codeRoot: '/project/billing',
          ownership: 'owned' as const,
          isExternal: false,
        },
      ],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('default')
    expect(out).toContain('billing-ws')
    expect(out).toContain('/project/specs')
    expect(out).toContain('/project/billing/specs')
  })

  it('plugins shown in text output', async () => {
    const config = makeMockConfig({
      plugins: [{ name: '@specd/plugin-agent-codex', contributions: ['codex'] }],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])

    const out = stdout()
    expect(out).toContain('plugins:')
    expect(out).toContain('@specd/plugin-agent-codex')
    expect(out).toContain('[contributions: codex]')
    expect(out).toContain('(present) [contributions: codex]')
  })

  it('does not render an artifactRules section even when the config carries artifactRules', async () => {
    const config = {
      ...makeMockConfig({ plugins: [{ name: '@specd/plugin-agent-codex' }] }),
      artifactRules: { specs: ['rule-text-that-must-not-appear'] },
    } as SpecdConfig
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])
    const out = stdout()
    // The rendering is real (known sections present) yet nothing of artifactRules leaks in.
    expect(out).toContain('workspaces:')
    expect(out).toContain('@specd/plugin-agent-codex  (present)')
    expect(out).not.toMatch(/artifactRules/i)
    expect(out).not.toContain('rule-text-that-must-not-appear')
  })

  it('omits the contributions suffix when the entry has no allowlist', async () => {
    const config = makeMockConfig({
      plugins: [{ name: '@specd/plugin-agent-codex' }],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])
    const out = stdout()
    expect(out).toContain('@specd/plugin-agent-codex  (present)')
    expect(out).not.toContain('[contributions:')
  })

  it('serializes the config as TOON', async () => {
    const config = makeMockConfig({
      plugins: [{ name: '@specd/plugin-agent-claude' }],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'toon'])
    // Decoding the TOON output must give back the resolved config, plugins list included.
    const decoded = decodeToon(stdout()) as Record<string, unknown>
    expect(decoded).toEqual(JSON.parse(JSON.stringify(config)))
    expect(decoded['plugins']).toEqual([{ name: '@specd/plugin-agent-claude' }])
    expect(decoded['projectRoot']).toBe('/project')
  })

  it('serializes plugins as the flat list in JSON output', async () => {
    const config = makeMockConfig({
      plugins: [{ name: '@acme/checks', contributions: ['lint'] }, { name: '@acme/other' }],
    })
    vi.mocked(loadConfig).mockResolvedValue(config)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--format', 'json'])
    expect(JSON.parse(stdout()).plugins).toEqual([
      { name: '@acme/checks', contributions: ['lint'] },
      { name: '@acme/other' },
    ])
  })

  it('does not open a host or load plugins', async () => {
    setup()
    vi.mocked(loadConfig).mockClear()
    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show'])
    expect(loadConfig).toHaveBeenCalledTimes(1)
    expect(resolveCliContext).not.toHaveBeenCalled()
  })
})

describe('Help text', () => {
  function helpText(): string {
    const stdout = captureStdout()
    mockProcessExit()
    const program = makeProgram()
    const config = program.command('config')
    registerConfigShow(config)
    config.commands.find((command) => command.name() === 'show')?.outputHelp({ error: false })
    return stdout()
  }

  /** Extracts the keys declared at the top level of a `{ a: T, b?: U }` block. */
  function topLevelKeys(block: string): string[] {
    const inner = block.slice(1, -1)
    const parts: string[] = []
    let depth = 0
    let current = ''
    for (const char of inner) {
      if ('{<[('.includes(char)) depth++
      if ('}>])'.includes(char)) depth--
      if (char === ',' && depth === 0) {
        parts.push(current)
        current = ''
      } else {
        current += char
      }
    }
    parts.push(current)
    return parts.map((part) => /^\s*([A-Za-z]+)\??:/.exec(part)?.[1] ?? `?${part}`)
  }

  /** Returns the `{ ... }` text that follows `marker` in the help, brace-balanced. */
  function blockAfter(help: string, marker: string): string {
    const start = help.indexOf(marker)
    expect(start).toBeGreaterThanOrEqual(0)
    const open = help.indexOf('{', start)
    let depth = 0
    for (let i = open; i < help.length; i++) {
      if (help[i] === '{') depth++
      if (help[i] === '}') depth--
      if (depth === 0) return help.slice(open, i + 1)
    }
    throw new Error(`unbalanced block after ${marker}`)
  }

  // Fully populated values: the explicit types make a new or removed field a compile error.
  const fullWorkspace: Required<SpecdWorkspaceConfig> = {
    name: 'w',
    prefix: 'p',
    specsPath: '/s',
    specsAdapter: { adapter: 'fs', config: {} },
    schemasPath: '/x',
    schemasAdapter: { adapter: 'fs', config: {} },
    codeRoot: '/c',
    ownership: 'owned',
    isExternal: false,
    contextIncludeSpecs: [],
    contextExcludeSpecs: [],
    graph: {},
  }
  const adapter = { adapter: 'fs', config: {} }
  const fullStorage: Required<SpecdStorageConfig> = {
    changesPath: '/a',
    changesAdapter: adapter,
    draftsPath: '/b',
    draftsAdapter: adapter,
    discardedPath: '/c',
    discardedAdapter: adapter,
    archivePath: '/d',
    archiveAdapter: adapter,
    archivePattern: 'x',
  }
  const fullConfig: Required<SpecdConfig> = {
    warnings: [],
    projectRoot: '/p',
    specdPath: '/p/.specd',
    configPath: '/p/.specd',
    schemaRef: 's',
    workspaces: [fullWorkspace],
    storage: fullStorage,
    approvals: { spec: false, signoff: false },
    graph: {},
    logging: { level: 'info' },
    context: [],
    contextIncludeSpecs: [],
    contextExcludeSpecs: [],
    contextMode: 'summary',
    llmOptimizedContext: false,
    actorProvider: 'a',
    privacy: { mode: 'hash' },
    schemaPlugins: [],
    schemaOverrides: {},
    invalidation: { artifacts: 'downstream', workflow: 'preserve' },
    plugins: [],
  }
  const contextVariants: SpecdContextEntry[] = [
    { id: 'i', file: 'f' },
    { id: 'i', instruction: 'x' },
  ]

  it('documents every key of SpecdConfig, workspaces, storage and context entries', () => {
    expect(Object.keys(PROJECT_KEYS).sort()).toEqual(Object.keys(fullConfig).sort())
    expect(Object.keys(WORKSPACE_KEYS).sort()).toEqual(Object.keys(fullWorkspace).sort())
    expect(Object.keys(STORAGE_KEYS).sort()).toEqual(Object.keys(fullStorage).sort())
    expect(Object.keys(CONTEXT_ENTRY_KEYS).sort()).toEqual(
      [...new Set(contextVariants.flatMap((entry) => Object.keys(entry)))].sort(),
    )
  })

  type OptionalKeysOf<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T]
  type OptionalInTable<T extends Record<string, ConfigShapeKey>> = {
    [K in keyof T]: T[K] extends { readonly optional: true } ? K : never
  }[keyof T]

  it('documents the type and optionality of each key as in the real SpecdConfig shape', () => {
    // Compile-time: a key marked optional in a table must be optional in the real type, and vice versa.
    expectTypeOf<OptionalInTable<typeof PROJECT_KEYS>>().toEqualTypeOf<
      OptionalKeysOf<SpecdConfig>
    >()
    expectTypeOf<OptionalInTable<typeof WORKSPACE_KEYS>>().toEqualTypeOf<
      OptionalKeysOf<SpecdWorkspaceConfig>
    >()
    expectTypeOf<OptionalInTable<typeof STORAGE_KEYS>>().toEqualTypeOf<
      OptionalKeysOf<SpecdStorageConfig>
    >()

    // Runtime: the help renders every key with its documented `?`; self-describing
    // types are rendered verbatim, placeholders (WORKSPACES, STORAGE, CONTEXT) are expanded.
    const help = helpText()
    for (const table of [PROJECT_KEYS, WORKSPACE_KEYS, STORAGE_KEYS, CONTEXT_ENTRY_KEYS]) {
      for (const [key, spec] of Object.entries(table) as Array<[string, ConfigShapeKey]>) {
        const isPlaceholder = /^[A-Z]+$/.test(spec.type)
        const rendered = `${key}${spec.optional === true ? '?' : ''}: ${isPlaceholder ? '' : spec.type}`
        expect(help, rendered).toContain(rendered)
      }
    }
  })

  it('renders each documented key at the level where SpecdConfig defines it', () => {
    const help = helpText()
    const workspace = blockAfter(help, 'workspaces: Array<')
    const storage = blockAfter(help, 'storage: ')
    expect(topLevelKeys(workspace).sort()).toEqual(Object.keys(fullWorkspace).sort())
    expect(topLevelKeys(storage).sort()).toEqual(Object.keys(fullStorage).sort())

    // Project-level fields never appear inside a workspace entry.
    const projectOnly = [
      'context',
      'contextMode',
      'llmOptimizedContext',
      'actorProvider',
      'privacy',
      'logging',
    ]
    for (const key of projectOnly) {
      expect(topLevelKeys(workspace)).not.toContain(key)
    }

    const withoutNested = help.replace(workspace, '{}').replace(storage, '{}')
    for (const key of Object.keys(fullConfig)) {
      expect(withoutNested).toMatch(new RegExp(`^ {2}${key}\\??: `, 'm'))
    }
    expect(help).toMatch(
      /Array<\{ id\?: string, file: string \} \| \{ id\?: string, instruction: string \}>/,
    )
  })
})

describe('Command signature', () => {
  it('rejects positional arguments without loading the config', async () => {
    const { stderr } = setup()
    vi.mocked(loadConfig).mockClear()
    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await expect(program.parseAsync(['node', 'specd', 'config', 'show', 'extra'])).rejects.toThrow(
      /too many arguments/i,
    )
    expect(loadConfig).not.toHaveBeenCalled()
    expect(stderr()).not.toContain('projectRoot')
  })
})

describe('Error cases', () => {
  it('Config not found', async () => {
    const { stderr } = setup()
    vi.mocked(loadConfig).mockRejectedValue(
      new ConfigValidationError('/missing/specd.yaml', 'no config file found'),
    )

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show']).catch(() => {})

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/error:/)
  })
})

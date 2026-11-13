import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HookResult } from '../../src/domain/value-objects/hook-result.js'
import { RegistryConflictError } from '../../src/application/errors/registry-conflict-error.js'
import { InvalidDisposerError } from '../../src/application/errors/invalid-disposer-error.js'
import { type ArtifactParser } from '../../src/application/ports/artifact-parser.js'
import { type SpecdConfig } from '../../src/application/specd-config.js'
import { createKernelBuilder } from '../../src/composition/kernel-builder.js'
import { createKernel } from '../../src/composition/kernel.js'
import { NullActorResolver } from '../../src/infrastructure/null/actor-resolver.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

/**
 * Creates a minimal fs-backed config for kernel builder tests.
 *
 * @returns A resolved config rooted at a fresh temp directory
 */
async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-kernel-builder-'))
  const specsPath = path.join(tmpDir, 'specs')
  const changesPath = path.join(tmpDir, '.specd', 'changes')
  const draftsPath = path.join(tmpDir, '.specd', 'drafts')
  const discardedPath = path.join(tmpDir, '.specd', 'discarded')
  const archivePath = path.join(tmpDir, '.specd', 'archive')
  await Promise.all([
    fs.mkdir(specsPath, { recursive: true }),
    fs.mkdir(changesPath, { recursive: true }),
    fs.mkdir(draftsPath, { recursive: true }),
    fs.mkdir(discardedPath, { recursive: true }),
    fs.mkdir(archivePath, { recursive: true }),
  ])

  return {
    projectRoot: tmpDir,
    configPath: path.join(tmpDir, 'specd.yaml'),
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath,
        specsAdapter: { adapter: 'fs', config: { path: specsPath } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: tmpDir,
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath,
      changesAdapter: { adapter: 'fs', config: { path: changesPath } },
      draftsPath,
      draftsAdapter: { adapter: 'fs', config: { path: draftsPath } },
      discardedPath,
      discardedAdapter: { adapter: 'fs', config: { path: discardedPath } },
      archivePath,
      archiveAdapter: { adapter: 'fs', config: { path: archivePath } },
    },
    approvals: { spec: false, signoff: false },
    invalidation: { artifacts: 'downstream', workflow: 'preserve' },
  }
}

/** Minimal no-op parser used for registry tests. */
const TOML_PARSER: ArtifactParser = {
  fileExtensions: ['.toml'],
  parse: () => ({ root: { type: 'document', children: [] } }),
  apply: (ast) => ({ ast, warnings: [] }),
  serialize: () => '',
  renderSubtree: () => '',
  nodeTypes: () => [],
  outline: () => [],
  selectorHints: () => ({}),
  deltaInstructions: () => '',
  parseDelta: () => [],
}

describe('createKernelBuilder', () => {
  it('supports fluent registration methods', async () => {
    const config = await makeConfig()
    const builder = createKernelBuilder(config)
    const remoteSpecFactory = { create: vi.fn() }
    const remoteSchemaFactory = { create: vi.fn() }
    const remoteChangeFactory = { create: vi.fn() }
    const remoteArchiveFactory = { create: vi.fn() }
    const vcsProvider = { name: 'custom-vcs', detect: vi.fn(async () => null) }
    const actorProvider = {
      name: 'custom-actor',
      create: vi.fn(async () => new NullActorResolver()),
      detect: vi.fn(async () => null),
    }
    const trimTransform = vi.fn((value: string) => value.trim())
    const runner = {
      acceptedTypes: ['docker'],
      run: vi.fn(async () => new HookResult(0, '', '')),
    }

    expect(
      builder
        .registerSpecStorage('remote-specs', remoteSpecFactory)
        .registerSchemaStorage('remote-schemas', remoteSchemaFactory)
        .registerChangeStorage('remote-changes', remoteChangeFactory)
        .registerArchiveStorage('remote-archive', remoteArchiveFactory)
        .registerParser('toml', TOML_PARSER)
        .registerExtractorTransform('trim', trimTransform)
        .registerVcsProvider(vcsProvider)
        .registerActorProvider(actorProvider)
        .registerExternalHookRunner('docker-runner', runner),
    ).toBe(builder)
  })

  it('builds kernels with createKernel-equivalent registry contents', async () => {
    const config = await makeConfig()
    const remoteSpecFactory = { create: vi.fn() }
    const vcsProvider = { name: 'custom-vcs', detect: vi.fn(async () => null) }
    const actorProvider = {
      name: 'custom-actor',
      create: vi.fn(async () => new NullActorResolver()),
      detect: vi.fn(async () => null),
    }
    const trimTransform = (value: string) => value.trim()
    const runner = {
      acceptedTypes: ['docker'],
      run: vi.fn(async () => new HookResult(0, '', '')),
    }

    const direct = await createKernel(config, {
      specStorageFactories: { remote: remoteSpecFactory },
      parsers: { toml: TOML_PARSER },
      extractorTransforms: { trim: trimTransform },
      vcsProviders: [vcsProvider],
      actorProviders: [actorProvider],
      externalHookRunners: [runner],
    })

    const built = await createKernelBuilder(config)
      .registerSpecStorage('remote', remoteSpecFactory)
      .registerParser('toml', TOML_PARSER)
      .registerExtractorTransform('trim', trimTransform)
      .registerVcsProvider(vcsProvider)
      .registerActorProvider(actorProvider)
      .registerExternalHookRunner('docker-runner', runner)
      .build()

    expect([...built.registry.storages.specs.keys()]).toEqual([
      ...direct.registry.storages.specs.keys(),
    ])
    expect([...built.registry.parsers.keys()]).toEqual([...direct.registry.parsers.keys()])
    expect([...built.registry.extractorTransforms.keys()]).toEqual([
      ...direct.registry.extractorTransforms.keys(),
    ])
    expect(built.registry.vcsProviders.map((p) => p.name)).toEqual(
      direct.registry.vcsProviders.map((p) => p.name),
    )
    expect(built.registry.actorProviders.map((p) => p.name)).toEqual(
      direct.registry.actorProviders.map((p) => p.name),
    )
    expect([...built.registry.externalHookRunners.keys()]).toEqual([
      ...direct.registry.externalHookRunners.keys(),
    ])
  })

  it('rejects conflicting registrations', async () => {
    const config = await makeConfig()

    expect(() => createKernelBuilder(config).registerParser('markdown', TOML_PARSER)).toThrow(
      RegistryConflictError,
    )

    const builder = createKernelBuilder(config).registerParser('toml', TOML_PARSER)
    expect(() => builder.registerParser('toml', TOML_PARSER)).toThrow(RegistryConflictError)
    expect(() =>
      createKernelBuilder(config).registerExtractorTransform('resolveSpecPath', (value) => value),
    ).toThrow(RegistryConflictError)
    expect(() =>
      createKernelBuilder(config)
        .registerExtractorTransform('trim', (value) => value)
        .registerExtractorTransform('trim', (value) => value),
    ).toThrow(RegistryConflictError)
  })

  it('accepts base registration state and extends it', async () => {
    const config = await makeConfig()
    const baseProvider = { name: 'base-vcs', detect: vi.fn(async () => null) }
    const extraProvider = { name: 'extra-vcs', detect: vi.fn(async () => null) }

    const kernel = await createKernelBuilder(config, { vcsProviders: [baseProvider] })
      .registerVcsProvider(extraProvider)
      .build()

    expect(kernel.registry.vcsProviders.map((p) => p.name)).toEqual(
      expect.arrayContaining(['base-vcs', 'extra-vcs', 'git', 'hg', 'svn']),
    )
  })

  it('forwards additionalDestinations of the base options to the kernel logger', async () => {
    const config = await makeConfig()
    const entries: Array<{ level: string; message: string }> = []
    const onLog = vi.fn((entry: { level: string; message: string }) => {
      entries.push({ level: entry.level, message: entry.message })
    })

    const kernel = await createKernelBuilder(config, {
      additionalDestinations: [{ target: 'callback', level: 'info', format: 'json', onLog }],
    }).build()
    try {
      const { Logger } = await import('../../src/application/logger.js')
      Logger.info('builder destination probe')

      expect(onLog).toHaveBeenCalled()
      expect(entries.some((e) => e.message === 'builder destination probe')).toBe(true)
    } finally {
      await kernel.dispose()
    }
  })

  it('does not expose graph-store builder methods on the fluent contract', async () => {
    const config = await makeConfig()
    const builder = createKernelBuilder(config) as unknown as Record<string, unknown>

    expect(builder.registerGraphStore).toBeUndefined()
    expect(builder.useGraphStore).toBeUndefined()
  })
  it('registerDisposer is chainable', async () => {
    const config = await makeConfig()
    const builder = createKernelBuilder(config)

    expect(builder.registerDisposer('a', () => {})).toBe(builder)
  })

  it('hands registered disposers to the kernel in call order and the builder never runs them', async () => {
    const config = await makeConfig()
    const order: string[] = []
    const kernel = await createKernelBuilder(config)
      .registerDisposer('a', () => void order.push('a'))
      .registerDisposer('b', () => void order.push('b'))
      .build()

    expect(order).toEqual([])
    await kernel.dispose()
    expect(order).toEqual(['b', 'a'])
  })

  it('rejects an empty disposer name', async () => {
    const builder = createKernelBuilder(await makeConfig())

    expect(() => builder.registerDisposer('', () => {})).toThrow(InvalidDisposerError)
  })

  it('rejects a non-string disposer name', async () => {
    const config = await makeConfig()
    const builder = createKernelBuilder(config)

    expect(() => builder.registerDisposer(42 as never, () => {})).toThrow(InvalidDisposerError)
  })

  it('rejects a non-callable dispose', async () => {
    const config = await makeConfig()
    const builder = createKernelBuilder(config)

    expect(() => builder.registerDisposer('plugins', undefined as never)).toThrow(
      InvalidDisposerError,
    )
  })

  it('rejects a duplicate disposer name and keeps the first registration', async () => {
    const config = await makeConfig()
    const first = vi.fn()
    const second = vi.fn()
    const builder = createKernelBuilder(config).registerDisposer('plugins', first)

    expect(() => builder.registerDisposer('plugins', second)).toThrow(RegistryConflictError)

    const kernel = await builder.build()
    await kernel.dispose()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('releases registered disposers in reverse order when build fails', async () => {
    const config = await makeConfig()
    const [workspace] = config.workspaces
    if (workspace === undefined) throw new Error('fixture has no workspace')
    const broken: SpecdConfig = {
      ...config,
      workspaces: [
        { ...workspace, specsAdapter: { adapter: 'does-not-exist', config: { path: '/nowhere' } } },
      ],
    }
    const order: string[] = []

    await expect(
      createKernelBuilder(broken)
        .registerDisposer('a', () => void order.push('a'))
        .registerDisposer('b', () => void order.push('b'))
        .build(),
    ).rejects.toThrow()

    expect(order).toEqual(['b', 'a'])
  })

  it('disposes a builder-built kernel the same way as an options-built kernel', async () => {
    const config = await makeConfig()
    const viaBuilder: string[] = []
    const viaOptions: string[] = []

    const built = await createKernelBuilder(config)
      .registerDisposer('a', () => void viaBuilder.push('a'))
      .registerDisposer('b', () => void viaBuilder.push('b'))
      .build()
    const direct = await createKernel(config, {
      disposers: [
        { name: 'a', dispose: () => void viaOptions.push('a') },
        { name: 'b', dispose: () => void viaOptions.push('b') },
      ],
    })
    await built.dispose()
    await direct.dispose()

    expect(viaBuilder).toEqual(viaOptions)
  })
})

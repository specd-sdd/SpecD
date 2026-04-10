import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HookResult } from '../../src/domain/value-objects/hook-result.js'
import { RegistryConflictError } from '../../src/application/errors/registry-conflict-error.js'
import { type ArtifactParser } from '../../src/application/ports/artifact-parser.js'
import { type SpecdConfig } from '../../src/application/specd-config.js'
import { createKernelBuilder } from '../../src/composition/kernel-builder.js'
import { createKernel } from '../../src/composition/kernel.js'

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
  }
}

/** Minimal no-op parser used for registry tests. */
const TOML_PARSER: ArtifactParser = {
  fileExtensions: ['.toml'],
  parse: () => ({ root: { type: 'document', children: [] } }),
  apply: (ast) => ast,
  serialize: () => '',
  renderSubtree: () => '',
  nodeTypes: () => [],
  outline: () => [],
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
    const actorProvider = { name: 'custom-actor', detect: vi.fn(async () => null) }
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
    const remoteGraphStoreFactory = { create: vi.fn() }
    const vcsProvider = { name: 'custom-vcs', detect: vi.fn(async () => null) }
    const actorProvider = { name: 'custom-actor', detect: vi.fn(async () => null) }
    const trimTransform = (value: string) => value.trim()
    const runner = {
      acceptedTypes: ['docker'],
      run: vi.fn(async () => new HookResult(0, '', '')),
    }

    const direct = await createKernel(config, {
      specStorageFactories: { remote: remoteSpecFactory },
      graphStoreFactories: { remote: remoteGraphStoreFactory },
      graphStoreId: 'sqlite',
      parsers: { toml: TOML_PARSER },
      extractorTransforms: { trim: trimTransform },
      vcsProviders: [vcsProvider],
      actorProviders: [actorProvider],
      externalHookRunners: [runner],
    })

    const built = await createKernelBuilder(config)
      .registerSpecStorage('remote', remoteSpecFactory)
      .registerGraphStore('remote', remoteGraphStoreFactory)
      .useGraphStore('sqlite')
      .registerParser('toml', TOML_PARSER)
      .registerExtractorTransform('trim', trimTransform)
      .registerVcsProvider(vcsProvider)
      .registerActorProvider(actorProvider)
      .registerExternalHookRunner('docker-runner', runner)
      .build()

    expect([...built.registry.storages.specs.keys()]).toEqual([
      ...direct.registry.storages.specs.keys(),
    ])
    expect([...built.registry.graphStores.keys()]).toEqual([...direct.registry.graphStores.keys()])
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
    expect(() =>
      createKernelBuilder(config).registerGraphStore('sqlite', { create: vi.fn() }),
    ).toThrow(RegistryConflictError)
    expect(() => createKernelBuilder(config).useGraphStore('missing')).toThrow(
      "graph store 'missing' is not registered",
    )
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
})

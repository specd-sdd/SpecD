import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HookResult } from '../../src/domain/value-objects/hook-result.js'
import { RegistryConflictError } from '../../src/application/errors/registry-conflict-error.js'
import { createKernel } from '../../src/composition/kernel.js'
import { type ArtifactParser } from '../../src/application/ports/artifact-parser.js'
import { type SpecdConfig } from '../../src/application/specd-config.js'

let tmpDir: string | undefined

afterEach(async () => {
  if (tmpDir !== undefined) {
    await fs.rm(tmpDir, { recursive: true, force: true })
    tmpDir = undefined
  }
})

/**
 * Creates a minimal fs-backed config for kernel composition tests.
 *
 * @returns A resolved config rooted at a fresh temp directory
 */
async function makeConfig(): Promise<SpecdConfig> {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'specd-kernel-'))
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
  apply: (ast) => ({ ast, warnings: [] }),
  serialize: () => '',
  renderSubtree: () => '',
  nodeTypes: () => [],
  outline: () => [],
  selectorHints: () => ({}),
  deltaInstructions: () => '',
  parseDelta: () => [],
}

describe('createKernel', () => {
  it('exposes merged built-in and additive registries', async () => {
    const config = await makeConfig()
    const remoteSpecFactory = { create: vi.fn() }
    const vcsProvider = { name: 'custom-vcs', detect: vi.fn(async () => null) }
    const actorProvider = { name: 'custom-actor', detect: vi.fn(async () => null) }
    const externalRunner = {
      acceptedTypes: ['docker'],
      run: vi.fn(async () => new HookResult(0, '', '')),
    }

    const kernel = await createKernel(config, {
      specStorageFactories: { remote: remoteSpecFactory },
      parsers: { toml: TOML_PARSER },
      vcsProviders: [vcsProvider],
      actorProviders: [actorProvider],
      externalHookRunners: [externalRunner],
    })

    expect(kernel.registry.storages.specs.has('fs')).toBe(true)
    expect(kernel.registry.storages.specs.get('remote')).toBe(remoteSpecFactory)
    expect(kernel.registry.parsers.has('markdown')).toBe(true)
    expect(kernel.registry.parsers.get('toml')).toBe(TOML_PARSER)
    expect(kernel.registry.vcsProviders[0]?.name).toBe('custom-vcs')
    expect(kernel.registry.actorProviders[0]?.name).toBe('custom-actor')
    expect(kernel.registry.externalHookRunners.get('docker')).toBe(externalRunner)
  })

  it('rejects additive registry conflicts against built-ins', async () => {
    const config = await makeConfig()

    await expect(createKernel(config, { parsers: { markdown: TOML_PARSER } })).rejects.toThrow(
      RegistryConflictError,
    )
  })

  it('rejects unknown storage adapter references during kernel construction', async () => {
    const config = await makeConfig()
    const badConfig = {
      ...config,
      workspaces: [
        {
          ...config.workspaces[0]!,
          specsAdapter: { adapter: 'remote', config: {} },
        },
      ],
    }

    await expect(createKernel(badConfig)).rejects.toThrow(
      /workspaces\.default\.specs\.adapter 'remote' is not registered/,
    )
  })

  it('initialises logging directory from configPath', async () => {
    const config = await makeConfig()
    await createKernel(config)

    const logDir = path.join(config.configPath, 'log')
    await expect(fs.stat(logDir)).resolves.toBeTruthy()
  })
})

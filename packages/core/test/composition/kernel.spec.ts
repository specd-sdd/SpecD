import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HookResult } from '../../src/domain/value-objects/hook-result.js'
import { RegistryConflictError } from '../../src/application/errors/registry-conflict-error.js'
import { CheckPredicateFailedError } from '../../src/domain/errors/check-predicate-failed-error.js'
import {
  UnknownCheckError,
  CheckNotSkippableError,
} from '../../src/domain/errors/check-registry-errors.js'
import { InvalidStateTransitionError } from '../../src/domain/errors/invalid-state-transition-error.js'
import { createKernel } from '../../src/composition/kernel.js'
import { NullActorResolver } from '../../src/infrastructure/null/actor-resolver.js'
import { GetSpecsHealth } from '../../src/application/use-cases/get-specs-health.js'
import { SearchSpecs } from '../../src/application/use-cases/search-specs.js'
import { CountTasks } from '../../src/application/use-cases/count-tasks.js'
import { type ArtifactParser } from '../../src/application/ports/artifact-parser.js'
import { type ActorProvider } from '../../src/composition/actor-provider.js'
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

describe('createKernel', () => {
  it('exposes merged built-in and additive registries', async () => {
    const config = await makeConfig()
    const remoteSpecFactory = { create: vi.fn() }
    const vcsProvider = { name: 'custom-vcs', detect: vi.fn(async () => null) }
    const actorProvider = {
      name: 'custom-actor',
      create: vi.fn(async () => new NullActorResolver()),
      detect: vi.fn(async () => null),
    }
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

  it('wires kernel.specs.search as SearchSpecs', async () => {
    const config = await makeConfig()
    const kernel = await createKernel(config)

    expect(kernel.specs.search).toBeInstanceOf(SearchSpecs)
  })

  it('wires kernel.specs.getHealth as GetSpecsHealth', async () => {
    const config = await makeConfig()
    const kernel = await createKernel(config)

    expect(kernel.specs.getHealth).toBeInstanceOf(GetSpecsHealth)
  })

  it('wires kernel.changes.countTasks as CountTasks', async () => {
    const config = await makeConfig()
    const kernel = await createKernel(config)

    expect(kernel.changes.countTasks).toBeInstanceOf(CountTasks)
  })

  it('wires the configured invalidation policy into kernel change creation', async () => {
    const base = await makeConfig()
    const config: SpecdConfig = {
      ...base,
      invalidation: { artifacts: 'global', workflow: 'redesign' },
      actorProvider: 'fixture',
    }
    const provider: ActorProvider = {
      name: 'fixture',
      create: async () => ({
        identity: async () => ({ name: 'Test Actor', email: 'test@example.com' }),
      }),
    }
    const kernel = await createKernel(config, { actorProviders: [provider] })

    const result = await kernel.changes.create.execute({
      name: 'kernel-policy',
      specIds: [],
      schemaName: 'schema-std',
      schemaVersion: 1,
    })

    expect(result.change.invalidationPolicy).toEqual(config.invalidation)
  })

  it('exposes persisted-state metadata surface without legacy editors', async () => {
    const config = await makeConfig()
    const kernel = await createKernel(config)

    expect(kernel.specs.initializePersistedState).toBeDefined()
    expect(kernel.specs.getPersistedDeps).toBeDefined()
    expect(kernel.specs.updatePersistedDeps).toBeDefined()
    expect(kernel.specs.getPersistedImplementation).toBeDefined()
    expect(kernel.specs.updatePersistedImplementation).toBeDefined()
    expect(kernel.specs.getPersistedOptimizations).toBeDefined()
    expect(kernel.specs.updatePersistedOptimizations).toBeDefined()
    expect(kernel.specs.getPersistedSchema).toBeDefined()
    expect(kernel.specs.updatePersistedSchema).toBeDefined()
    expect('saveMetadata' in kernel.specs).toBe(false)
    expect('updateMetadata' in kernel.specs).toBe(false)
    expect('invalidateMetadata' in kernel.specs).toBe(false)
  })

  describe('Kernel custom checks end-to-end', () => {
    const fixtureProvider: ActorProvider = {
      name: 'fixture',
      create: async () => ({
        identity: async () => ({ name: 'Test Actor', email: 'test@example.com' }),
      }),
    }

    async function makeTestKernel(
      checks: import('../../src/composition/composition-registries.js').PluginCheckRegistration[],
    ) {
      const base = await makeConfig()
      const config: SpecdConfig = {
        ...base,
        actorProvider: 'fixture',
      }
      return createKernel(config, {
        actorProviders: [fixtureProvider],
        checks,
      })
    }

    it('executes custom check during transition and succeeds when it passes', async () => {
      const kernel = await makeTestKernel([
        {
          pluginName: 'qa',
          check: {
            id: 'smoke',
            label: 'QA Smoke Test',
            execute: async () => ({
              id: '@qa.smoke',
              label: 'QA Smoke Test',
              kind: 'predicate',
              outcome: 'pass',
            }),
          },
          defaultBindings: [
            { scope: 'transition', from: 'drafting', to: 'designing', skippable: true },
          ],
        },
      ])

      await kernel.changes.create.execute({
        name: 'custom-check-change',
        specIds: [],
        schemaName: 'schema-std',
        schemaVersion: 1,
      })

      const result = await kernel.changes.transition.execute({
        name: 'custom-check-change',
        to: 'designing',
      })

      expect(result.change.state).toBe('designing')
    })

    it('aborts transition with CheckPredicateFailedError when custom check fails', async () => {
      const kernel = await makeTestKernel([
        {
          pluginName: 'qa',
          check: {
            id: 'smoke',
            label: 'QA Smoke Test',
            execute: async () => ({
              id: '@qa.smoke',
              label: 'QA Smoke Test',
              kind: 'predicate',
              outcome: 'fail',
              code: 'QA_SMOKE_FAILED',
              message: 'Smoke test assertions failed',
            }),
          },
          defaultBindings: [
            { scope: 'transition', from: 'drafting', to: 'designing', skippable: true },
          ],
        },
      ])

      await kernel.changes.create.execute({
        name: 'failing-check-change',
        specIds: [],
        schemaName: 'schema-std',
        schemaVersion: 1,
      })

      await expect(
        kernel.changes.transition.execute({
          name: 'failing-check-change',
          to: 'designing',
        }),
      ).rejects.toThrow(CheckPredicateFailedError)

      try {
        await kernel.changes.transition.execute({
          name: 'failing-check-change',
          to: 'designing',
        })
      } catch (err) {
        expect(err).toBeInstanceOf(CheckPredicateFailedError)
        const checkErr = err as CheckPredicateFailedError
        expect(checkErr.checkId).toBe('@qa.smoke')
        expect(checkErr.label).toBe('QA Smoke Test')
        expect(checkErr.code).toBe('QA_SMOKE_FAILED')
        expect(checkErr.message).toContain('Smoke test assertions failed')
      }
    })

    it('bypasses a failing custom check via skipChecks', async () => {
      const kernel = await makeTestKernel([
        {
          pluginName: 'qa',
          check: {
            id: 'smoke',
            label: 'QA Smoke Test',
            execute: async () => ({
              id: '@qa.smoke',
              label: 'QA Smoke Test',
              kind: 'predicate',
              outcome: 'fail',
              code: 'QA_SMOKE_FAILED',
              message: 'Smoke test assertions failed',
            }),
          },
          defaultBindings: [
            { scope: 'transition', from: 'drafting', to: 'designing', skippable: true },
          ],
        },
      ])

      await kernel.changes.create.execute({
        name: 'bypass-check-change',
        specIds: [],
        schemaName: 'schema-std',
        schemaVersion: 1,
      })

      const result = await kernel.changes.transition.execute({
        name: 'bypass-check-change',
        to: 'designing',
        skipChecks: ['@qa.smoke'],
      })

      expect(result.change.state).toBe('designing')
    })

    it('rejects transition with UnknownCheckError when non-existent check is passed in skipChecks', async () => {
      const kernel = await makeTestKernel([])

      await kernel.changes.create.execute({
        name: 'unknown-check-change',
        specIds: [],
        schemaName: 'schema-std',
        schemaVersion: 1,
      })

      await expect(
        kernel.changes.transition.execute({
          name: 'unknown-check-change',
          to: 'designing',
          skipChecks: ['@nonexistent.check'],
        }),
      ).rejects.toThrow(UnknownCheckError)
    })

    it('rejects transition with CheckNotSkippableError when non-skippable check is passed in skipChecks', async () => {
      const kernel = await makeTestKernel([])

      await kernel.changes.create.execute({
        name: 'non-skippable-change',
        specIds: [],
        schemaName: 'schema-std',
        schemaVersion: 1,
      })

      await expect(
        kernel.changes.transition.execute({
          name: 'non-skippable-change',
          to: 'designing',
          skipChecks: ['protocol.edge'],
        }),
      ).rejects.toThrow(CheckNotSkippableError)
    })

    it('rejects transition with CheckNotSkippableError when hook effect check is passed in skipChecks', async () => {
      const kernel = await makeTestKernel([])

      await kernel.changes.create.execute({
        name: 'hook-skip-change',
        specIds: [],
        schemaName: 'schema-std',
        schemaVersion: 1,
      })

      await expect(
        kernel.changes.transition.execute({
          name: 'hook-skip-change',
          to: 'designing',
          skipChecks: ['hook.pre'],
        }),
      ).rejects.toThrow(CheckNotSkippableError)
    })

    it('fails fast on internal protocol.edge before executing custom checks on illegal transitions', async () => {
      let customCheckExecuted = false
      const kernel = await makeTestKernel([
        {
          pluginName: 'qa',
          check: {
            id: 'always-pass',
            label: 'Always Pass',
            execute: async () => {
              customCheckExecuted = true
              return {
                id: '@qa.always-pass',
                label: 'Always Pass',
                kind: 'predicate',
                outcome: 'pass',
              }
            },
          },
          defaultBindings: [
            { scope: 'transition', from: '*', to: '*', along: '*', skippable: true },
          ],
        },
      ])

      await kernel.changes.create.execute({
        name: 'illegal-transition-change',
        specIds: [],
        schemaName: 'schema-std',
        schemaVersion: 1,
      })

      // Attempting illegal transition directly from drafting to done
      await expect(
        kernel.changes.transition.execute({
          name: 'illegal-transition-change',
          to: 'done',
        }),
      ).rejects.toThrow(InvalidStateTransitionError)

      // Internal check protocol.edge runs first and fails fast, so custom check should NOT run
      expect(customCheckExecuted).toBe(false)
    })
  })
})

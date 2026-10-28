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
import { KERNEL_DISPOSER_TIMEOUT_MS } from '../../src/composition/kernel-disposal.js'
import { Logger } from '../../src/application/logger.js'
import { InvalidDisposerError } from '../../src/application/errors/invalid-disposer-error.js'
import { DisposerFailedError } from '../../src/application/errors/disposer-failed-error.js'
import { createResolveChangeSchema } from '../../src/composition/use-cases/resolve-change-schema.js'
import { makeSchema } from '../application/use-cases/helpers.js'
import { ResolveChangeSchema } from '../../src/application/services/resolve-change-schema.js'
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

    it('still rejects illegal transitions even when custom checks pass', async () => {
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

      // Execute mode evaluates protocol.edge first and stops on failure, so the
      // custom check never runs for an illegal edge.
      expect(customCheckExecuted).toBe(false)
    })
  })
  it('exposes the shared ResolveChangeSchema and builds working instances from both factory overloads', async () => {
    const config = await makeConfig()
    const kernel = await createKernel(config)

    expect(kernel.changes.resolveSchema).toBeInstanceOf(ResolveChangeSchema)

    const fromConfig = createResolveChangeSchema(config)
    expect(fromConfig).toBeInstanceOf(ResolveChangeSchema)

    const fixture = makeSchema({ name: 'fixture-schema', version: 1 })
    const fromDeps = createResolveChangeSchema({
      schemaProvider: { get: async () => fixture },
    })
    const resolved = await fromDeps.execute({
      changeName: 'any',
      schemaName: 'fixture-schema',
      schemaVersion: 1,
    })
    expect(resolved.schema).toBe(fixture)
    expect(resolved.warnings).toEqual([])
  })
})

/**
 * Builds a config whose spec storage adapter is not registered, so kernel construction fails.
 *
 * @returns A config that makes `createKernel` reject
 */
async function makeBrokenConfig(): Promise<SpecdConfig> {
  const config = await makeConfig()
  const [workspace] = config.workspaces
  if (workspace === undefined) throw new Error('fixture has no workspace')
  return {
    ...config,
    workspaces: [
      { ...workspace, specsAdapter: { adapter: 'does-not-exist', config: { path: '/nowhere' } } },
    ],
  }
}

describe('createKernel disposal', () => {
  it('exposes dispose as its only lifecycle operation', async () => {
    const kernel = await createKernel(await makeConfig())
    const record = kernel as unknown as Record<string | symbol, unknown>

    expect(typeof record['dispose']).toBe('function')
    expect(typeof record[Symbol.asyncDispose]).toBe('function')
    expect(record['initialize']).toBeUndefined()
    expect(record['shutdown']).toBeUndefined()
    expect(record['on']).toBeUndefined()
    expect(record['addUseCase']).toBeUndefined()
    expect(record['removeUseCase']).toBeUndefined()
  })

  it('treats Symbol.asyncDispose as an alias and supports await using', async () => {
    const disposed = vi.fn()
    const config = await makeConfig()
    {
      await using kernel = await createKernel(config, {
        disposers: [{ name: 'a', dispose: disposed }],
      })
      expect(kernel[Symbol.asyncDispose]).toBe(kernel.dispose)
      expect(disposed).not.toHaveBeenCalled()
    }
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('shares one promise across repeated and concurrent dispose calls', async () => {
    const disposed = vi.fn()
    const kernel = await createKernel(await makeConfig(), {
      disposers: [{ name: 'a', dispose: disposed }],
    })

    const first = kernel.dispose()
    const second = kernel.dispose()
    await first
    const third = kernel.dispose()

    expect(second).toBe(first)
    expect(third).toBe(first)
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('runs the supplied disposers in reverse order and isolates failures', async () => {
    const order: string[] = []
    const kernel = await createKernel(await makeConfig(), {
      disposers: [
        { name: 'a', dispose: () => void order.push('a') },
        {
          name: 'b',
          dispose: () => {
            order.push('b')
            throw new Error('boom')
          },
        },
        { name: 'c', dispose: () => void order.push('c') },
      ],
    })

    const failure = await kernel.dispose().then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(order).toEqual(['c', 'b', 'a'])
    expect(failure).toBeInstanceOf(AggregateError)
    const [only] = (failure as AggregateError).errors as DisposerFailedError[]
    expect(only?.message).toBe("Disposer 'b' failed")
  })

  it('resolves dispose for a kernel without disposers', async () => {
    const kernel = await createKernel(await makeConfig())
    await expect(kernel.dispose()).resolves.toBeUndefined()
  })

  it('rejects an empty disposer name', async () => {
    await expect(
      createKernel(await makeConfig(), { disposers: [{ name: '', dispose: () => {} }] }),
    ).rejects.toBeInstanceOf(InvalidDisposerError)
  })

  it('rejects a non-callable dispose before any disposer runs', async () => {
    const first = vi.fn()

    await expect(
      createKernel(await makeConfig(), {
        disposers: [
          { name: 'a', dispose: first },
          { name: 'broken', dispose: undefined as never },
        ],
      }),
    ).rejects.toBeInstanceOf(InvalidDisposerError)

    // The well-formed sibling is released once by the failed-construction path, not run earlier.
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('reports each failed disposer as a DisposerFailedError with the original failure as cause', async () => {
    const original = new Error('boom')
    const kernel = await createKernel(await makeConfig(), {
      disposers: [
        {
          name: 'bad',
          dispose: () => {
            throw original
          },
        },
      ],
    })

    const failure = (await kernel.dispose().then(
      () => undefined,
      (error: unknown) => error,
    )) as AggregateError

    const [only] = failure.errors as DisposerFailedError[]
    expect(only).toBeInstanceOf(DisposerFailedError)
    expect(only?.cause).toBe(original)
  })

  it('never throws synchronously, even when a disposer throws synchronously', async () => {
    const kernel = await createKernel(await makeConfig(), {
      disposers: [
        {
          name: 'bad',
          dispose: () => {
            throw new Error('sync boom')
          },
        },
      ],
    })

    let pending: Promise<void> | undefined
    expect(() => {
      pending = kernel.dispose()
    }).not.toThrow()
    expect(pending).toBeInstanceOf(Promise)
    await expect(pending).rejects.toBeInstanceOf(AggregateError)
  })

  it('keeps a rejected disposal rejected on later calls without rerunning disposers', async () => {
    const dispose = vi.fn(() => {
      throw new Error('boom')
    })
    const kernel = await createKernel(await makeConfig(), { disposers: [{ name: 'bad', dispose }] })

    const first = kernel.dispose()
    await expect(first).rejects.toBeInstanceOf(AggregateError)
    const second = kernel.dispose()

    expect(second).toBe(first)
    await expect(second).rejects.toBeInstanceOf(AggregateError)
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('abandons a hanging disposer after the timeout through kernel.dispose and logs a warning', async () => {
    vi.useFakeTimers()
    try {
      const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {})
      const healthy = vi.fn()
      const kernel = await createKernel(await makeConfig(), {
        disposers: [
          { name: 'healthy', dispose: healthy },
          { name: 'hanging', dispose: () => new Promise<void>(() => {}) },
        ],
      })

      const disposed = kernel.dispose()
      await vi.advanceTimersByTimeAsync(KERNEL_DISPOSER_TIMEOUT_MS)

      await expect(disposed).resolves.toBeUndefined()
      expect(healthy).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls.some((call) => String(call[0]).includes('hanging'))).toBe(true)
      warn.mockRestore()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a duplicate disposer name with a RegistryConflictError', async () => {
    await expect(
      createKernel(await makeConfig(), {
        disposers: [
          { name: 'plugins', dispose: () => {} },
          { name: 'plugins', dispose: () => {} },
        ],
      }),
    ).rejects.toBeInstanceOf(RegistryConflictError)
  })

  it('releases the disposers in reverse order when construction fails', async () => {
    const order: string[] = []

    await expect(
      createKernel(await makeBrokenConfig(), {
        disposers: [
          { name: 'a', dispose: () => void order.push('a') },
          { name: 'b', dispose: () => void order.push('b') },
        ],
      }),
    ).rejects.toThrow()

    expect(order).toEqual(['b', 'a'])
  })

  it('keeps the original construction error when a disposer also fails', async () => {
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => {})
    const broken = await makeBrokenConfig()
    const baseline = await createKernel(broken).then(
      () => undefined,
      (error: unknown) => error as Error,
    )

    const failure = await createKernel(broken, {
      disposers: [
        {
          name: 'bad',
          dispose: () => {
            throw new Error('cleanup failed')
          },
        },
      ],
    }).then(
      () => undefined,
      (error: unknown) => error as Error,
    )

    expect(baseline).toBeInstanceOf(Error)
    expect(failure).toBeInstanceOf(Error)
    expect(failure?.message).toBe(baseline?.message)
    expect(failure).not.toBeInstanceOf(AggregateError)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('still releases well-formed entries once when entries conflict', async () => {
    const good = vi.fn()

    await expect(
      createKernel(await makeConfig(), {
        disposers: [
          { name: 'dup', dispose: () => {} },
          { name: 'dup', dispose: () => {} },
          { name: 'good', dispose: good },
        ],
      }),
    ).rejects.toBeInstanceOf(RegistryConflictError)

    expect(good).toHaveBeenCalledTimes(1)
  })
})

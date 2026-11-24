import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveChange } from '../../../src/application/use-cases/archive-change.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createArchiveChange,
  resolveArchiveChangeDeps,
  type ArchiveChangeDeps,
} from '../../../src/composition/use-cases/archive-change.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import { CheckRegistry } from '../../../src/domain/services/check-registry.js'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'

let fixture: CompositionFactoryFixture = { tmpDir: undefined }

afterEach(async () => {
  await cleanupCompositionFactoryConfig(fixture)
})

describe('createArchiveChange', () => {
  it('returns a wired ArchiveChange instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-archive-change')
    fixture = setup.fixture

    expect(createArchiveChange(setup.config)).toBeInstanceOf(ArchiveChange)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: ArchiveChangeDeps = {
      changes: {} as never,
      listWorkspaces: {} as never,
      archive: {} as never,
      archiveBindings: [],
      actor: {} as never,
      parsers: new Map(),
      schemaProvider: {} as never,
      materializeMetadata: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      projectRoot: '/tmp/project',
      batchSnapshot: {} as never,
      contentHasher: {} as never,
      reconcile: {} as never,
    }

    expect(createArchiveChange(deps)).toBeInstanceOf(ArchiveChange)
  })

  it('resolves the executable check registry with archive bindings from the config bootstrap', async () => {
    const setup = await setupCompositionFactoryConfig('specd-archive-check-registry')
    fixture = setup.fixture

    const deps = resolveArchiveChangeDeps(createCompositionResolver(setup.config))

    expect(deps.checkRegistry).toBeInstanceOf(CheckRegistry)
    const readOnly = deps.checkRegistry
      ?.getBindings('workspace.readOnly')
      .find((binding) => binding.applicability.some((row) => row.scope === 'archive'))
    expect(readOnly?.allowDisable).toBe(false)
    expect(deps.archiveBindings.some((binding) => binding.check.id === 'spec.overlap')).toBe(true)
  })

  it('accepts explicit deps that carry a check registry', () => {
    const deps: ArchiveChangeDeps = {
      changes: {} as never,
      listWorkspaces: {} as never,
      archive: {} as never,
      archiveBindings: [],
      actor: {} as never,
      parsers: new Map(),
      schemaProvider: {} as never,
      materializeMetadata: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      projectRoot: '/tmp/project',
      batchSnapshot: {} as never,
      contentHasher: {} as never,
      reconcile: {} as never,
      checkRegistry: new CheckRegistry(),
    }

    expect(createArchiveChange(deps)).toBeInstanceOf(ArchiveChange)
  })

  it('rejects deps plus composition options', () => {
    const deps: ArchiveChangeDeps = {
      changes: {} as never,
      listWorkspaces: {} as never,
      archive: {} as never,
      archiveBindings: [],
      actor: {} as never,
      parsers: new Map(),
      schemaProvider: {} as never,
      materializeMetadata: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      projectRoot: '/tmp/project',
      batchSnapshot: {} as never,
      contentHasher: {} as never,
      reconcile: {} as never,
    }

    expect(() =>
      createArchiveChange(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { ArchiveChange } from '../../../src/application/use-cases/archive-change.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createArchiveChange,
  type ArchiveChangeDeps,
} from '../../../src/composition/use-cases/archive-change.js'
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
      runStepHooks: {} as never,
      actor: {} as never,
      parsers: new Map(),
      schemaProvider: {} as never,
      generateMetadata: {} as never,
      saveMetadata: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      projectRoot: '/tmp/project',
      batchSnapshot: {} as never,
    }

    expect(createArchiveChange(deps)).toBeInstanceOf(ArchiveChange)
  })

  it('rejects deps plus composition options', () => {
    const deps: ArchiveChangeDeps = {
      changes: {} as never,
      listWorkspaces: {} as never,
      archive: {} as never,
      runStepHooks: {} as never,
      actor: {} as never,
      parsers: new Map(),
      schemaProvider: {} as never,
      generateMetadata: {} as never,
      saveMetadata: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      projectRoot: '/tmp/project',
      batchSnapshot: {} as never,
    }

    expect(() =>
      createArchiveChange(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

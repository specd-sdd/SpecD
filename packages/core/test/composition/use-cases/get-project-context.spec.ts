import { afterEach, describe, expect, it } from 'vitest'
import { GetProjectContext } from '../../../src/application/use-cases/get-project-context.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createGetProjectContext,
  type GetProjectContextDeps,
} from '../../../src/composition/use-cases/get-project-context.js'
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

describe('createGetProjectContext', () => {
  it('returns a wired GetProjectContext instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-get-project-context')
    fixture = setup.fixture

    expect(createGetProjectContext(setup.config)).toBeInstanceOf(GetProjectContext)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: GetProjectContextDeps = {
      listWorkspaces: {} as never,
      schemaProvider: {} as never,
      fileReader: { read: async () => null },
      parsers: new Map(),
      contentHasher: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      defaultConfig: {},
    }

    expect(createGetProjectContext(deps)).toBeInstanceOf(GetProjectContext)
  })

  it('rejects deps plus composition options', () => {
    const deps: GetProjectContextDeps = {
      listWorkspaces: {} as never,
      schemaProvider: {} as never,
      fileReader: { read: async () => null },
      parsers: new Map(),
      contentHasher: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      defaultConfig: {},
    }

    expect(() =>
      createGetProjectContext(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

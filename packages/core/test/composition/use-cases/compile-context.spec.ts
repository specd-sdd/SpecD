import { afterEach, describe, expect, it } from 'vitest'
import { CompileContext } from '../../../src/application/use-cases/compile-context.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createCompileContext,
  type CompileContextDeps,
} from '../../../src/composition/use-cases/compile-context.js'
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

describe('createCompileContext', () => {
  it('returns a wired CompileContext instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-compile-context')
    fixture = setup.fixture

    expect(createCompileContext(setup.config)).toBeInstanceOf(CompileContext)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: CompileContextDeps = {
      changes: {} as never,
      listWorkspaces: {} as never,
      schemaProvider: {} as never,
      fileReader: { read: async () => null },
      parsers: new Map(),
      contentHasher: {} as never,
      previewSpec: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      lifecycle: {} as never,
      defaultConfig: {},
    }

    expect(createCompileContext(deps)).toBeInstanceOf(CompileContext)
  })

  it('rejects deps plus composition options', () => {
    const deps: CompileContextDeps = {
      changes: {} as never,
      listWorkspaces: {} as never,
      schemaProvider: {} as never,
      fileReader: { read: async () => null },
      parsers: new Map(),
      contentHasher: {} as never,
      previewSpec: {} as never,
      extractorTransforms: new Map(),
      workspaceRoutes: [],
      lifecycle: {} as never,
      defaultConfig: {},
    }

    expect(() =>
      createCompileContext(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

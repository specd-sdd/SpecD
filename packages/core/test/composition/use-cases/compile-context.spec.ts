import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompileContext } from '../../../src/application/use-cases/compile-context.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  createCompileContext,
  resolveCompileContextDeps,
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
      defaultConfig: {},
    }

    expect(() =>
      createCompileContext(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })

  it('does not resolve LifecycleEngine through resolveCompileContextDeps', async () => {
    const setup = await setupCompositionFactoryConfig('specd-compile-context-deps')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)
    const getLifecycleEngine = vi.spyOn(resolver, 'getLifecycleEngine')

    const deps = resolveCompileContextDeps(resolver)

    expect(getLifecycleEngine).not.toHaveBeenCalled()
    expect(deps).toMatchObject({
      changes: expect.anything(),
      listWorkspaces: expect.anything(),
      schemaProvider: expect.anything(),
      fileReader: expect.anything(),
      parsers: expect.anything(),
      contentHasher: expect.anything(),
      previewSpec: expect.anything(),
      extractorTransforms: expect.anything(),
      workspaceRoutes: expect.anything(),
      defaultConfig: expect.anything(),
    })
    expect(deps).not.toHaveProperty('lifecycle')
  })
})

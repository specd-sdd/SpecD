import { GetPersistedSpecOptimizations } from '../../../src/application/use-cases/get-persisted-spec-optimizations.js'
import {
  createGetPersistedSpecOptimizations,
  resolveGetPersistedSpecOptimizationsDeps,
} from '../../../src/composition/use-cases/get-persisted-spec-optimizations.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'GetPersistedSpecOptimizations',
  createGetPersistedSpecOptimizations,
  GetPersistedSpecOptimizations,
  () => ({ specRepositories: new Map(), getActiveSchema: {} as never }),
)

describe('resolveGetPersistedSpecOptimizationsDeps', () => {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
  })

  it('resolves the workspace spec repositories from the resolver', async () => {
    const setup = await setupCompositionFactoryConfig(
      'specd-resolve-get-persisted-spec-optimizations',
    )
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveGetPersistedSpecOptimizationsDeps(resolver)

    expect(deps.specRepositories).toBe(resolver.getSpecRepositories())
    expect([...deps.specRepositories.keys()]).toEqual(['default'])
    expect(deps.getActiveSchema).toBeDefined()
  })
})

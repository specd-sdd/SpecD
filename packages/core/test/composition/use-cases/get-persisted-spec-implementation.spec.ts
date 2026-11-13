import { GetPersistedSpecImplementation } from '../../../src/application/use-cases/get-persisted-spec-implementation.js'
import {
  createGetPersistedSpecImplementation,
  resolveGetPersistedSpecImplementationDeps,
} from '../../../src/composition/use-cases/get-persisted-spec-implementation.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'GetPersistedSpecImplementation',
  createGetPersistedSpecImplementation,
  GetPersistedSpecImplementation,
  () => ({ specRepositories: new Map() }),
)

describe('resolveGetPersistedSpecImplementationDeps', () => {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
  })

  it('resolves the workspace spec repositories from the resolver', async () => {
    const setup = await setupCompositionFactoryConfig(
      'specd-resolve-get-persisted-spec-implementation',
    )
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveGetPersistedSpecImplementationDeps(resolver)

    expect(deps.specRepositories).toBe(resolver.getSpecRepositories())
    expect([...deps.specRepositories.keys()]).toEqual(['default'])
  })
})

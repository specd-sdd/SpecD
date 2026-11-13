import { GetPersistedSpecDeps } from '../../../src/application/use-cases/get-persisted-spec-deps.js'
import {
  createGetPersistedSpecDeps,
  resolveGetPersistedSpecDepsDeps,
} from '../../../src/composition/use-cases/get-persisted-spec-deps.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'GetPersistedSpecDeps',
  createGetPersistedSpecDeps,
  GetPersistedSpecDeps,
  () => ({ specRepositories: new Map() }),
)

describe('resolveGetPersistedSpecDepsDeps', () => {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
  })

  it('resolves the workspace spec repositories from the resolver', async () => {
    const setup = await setupCompositionFactoryConfig('specd-resolve-get-persisted-spec-deps')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveGetPersistedSpecDepsDeps(resolver)

    expect(deps.specRepositories).toBe(resolver.getSpecRepositories())
    expect([...deps.specRepositories.keys()]).toEqual(['default'])
  })
})

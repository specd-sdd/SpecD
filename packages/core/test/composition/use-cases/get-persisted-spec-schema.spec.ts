import { GetPersistedSpecSchema } from '../../../src/application/use-cases/get-persisted-spec-schema.js'
import {
  createGetPersistedSpecSchema,
  resolveGetPersistedSpecSchemaDeps,
} from '../../../src/composition/use-cases/get-persisted-spec-schema.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'
import { describeCompositionFactorySmoke } from './composition-factory-smoke.js'

describeCompositionFactorySmoke(
  'GetPersistedSpecSchema',
  createGetPersistedSpecSchema,
  GetPersistedSpecSchema,
  () => ({ specRepositories: new Map() }),
)

describe('resolveGetPersistedSpecSchemaDeps', () => {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
  })

  it('resolves the workspace spec repositories from the resolver', async () => {
    const setup = await setupCompositionFactoryConfig('specd-resolve-get-persisted-spec-schema')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveGetPersistedSpecSchemaDeps(resolver)

    expect(deps.specRepositories).toBe(resolver.getSpecRepositories())
    expect([...deps.specRepositories.keys()]).toEqual(['default'])
  })
})

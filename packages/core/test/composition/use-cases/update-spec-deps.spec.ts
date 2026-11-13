import { afterEach, describe, expect, it } from 'vitest'
import { UpdateSpecDeps } from '../../../src/application/use-cases/update-spec-deps.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  createUpdateSpecDeps,
  resolveUpdateSpecDepsDeps,
} from '../../../src/composition/use-cases/update-spec-deps.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'

let fixture: CompositionFactoryFixture | undefined

afterEach(async () => {
  if (fixture !== undefined) await cleanupCompositionFactoryConfig(fixture)
  fixture = undefined
})

describe('createUpdateSpecDeps', () => {
  it('resolves the change repository and workspace names from the resolver', async () => {
    const setup = await setupCompositionFactoryConfig('specd-update-spec-deps')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveUpdateSpecDepsDeps(resolver)

    expect(deps.changes).toBe(resolver.getChangeRepository())
    expect([...deps.workspaces]).toEqual(['default'])
  })

  it('builds the use case from config', async () => {
    const setup = await setupCompositionFactoryConfig('specd-update-spec-deps')
    fixture = setup.fixture

    expect(createUpdateSpecDeps(setup.config)).toBeInstanceOf(UpdateSpecDeps)
  })

  it('builds the use case from explicit deps', () => {
    const uc = createUpdateSpecDeps({ changes: {} as never, workspaces: ['default'] })

    expect(uc).toBeInstanceOf(UpdateSpecDeps)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { GetChangeSpecDeps } from '../../../src/application/use-cases/get-change-spec-deps.js'
import { GetStatus } from '../../../src/application/use-cases/get-status.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  createGetChangeSpecDeps,
  resolveGetChangeSpecDepsDeps,
} from '../../../src/composition/use-cases/get-change-spec-deps.js'
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

describe('createGetChangeSpecDeps', () => {
  it('resolves getStatus and workspace names from the resolver', async () => {
    const setup = await setupCompositionFactoryConfig('specd-get-change-spec-deps')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveGetChangeSpecDepsDeps(resolver)

    expect(deps.getStatus).toBeInstanceOf(GetStatus)
    expect([...deps.workspaces]).toEqual(['default'])
  })

  it('builds the use case from config', async () => {
    const setup = await setupCompositionFactoryConfig('specd-get-change-spec-deps')
    fixture = setup.fixture

    expect(createGetChangeSpecDeps(setup.config)).toBeInstanceOf(GetChangeSpecDeps)
  })

  it('builds the use case from explicit deps', () => {
    const uc = createGetChangeSpecDeps({ getStatus: {} as never, workspaces: ['default'] })

    expect(uc).toBeInstanceOf(GetChangeSpecDeps)
  })
})

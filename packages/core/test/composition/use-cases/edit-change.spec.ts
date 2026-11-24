import { afterEach, describe, expect, it } from 'vitest'
import { EditChange } from '../../../src/application/use-cases/edit-change.js'
import { ChangeNotFoundError } from '../../../src/application/errors/change-not-found-error.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  createEditChange,
  resolveEditChangeDeps,
} from '../../../src/composition/use-cases/edit-change.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'

let fixture: CompositionFactoryFixture = { tmpDir: undefined }

afterEach(async () => {
  await cleanupCompositionFactoryConfig(fixture)
})

describe('resolveEditChangeDeps', () => {
  it('resolves every dependency from the composition resolver, including the reconciler', async () => {
    const setup = await setupCompositionFactoryConfig('specd-resolve-edit-change-deps')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolveEditChangeDeps(resolver)

    expect(deps.changes).toBe(resolver.getChangeRepository())
    expect(deps.listWorkspaces).toBe(resolver.getListWorkspaces())
    expect(deps.actor).toBe(resolver.getActorResolver())
    expect(deps.schemaProvider).toBe(resolver.getSchemaProvider())
    expect(deps.resolveChangeSchema).toBe(resolver.getResolveChangeSchema())
    expect(deps.refreshImplementationTracking).toBe(resolver.getRefreshImplementationTracking())
    expect(deps.reconcile).toBe(resolver.getReconcileChangeValidity())
  })
})

describe('createEditChange', () => {
  it('config form and resolved-deps form build working use cases', async () => {
    const setup = await setupCompositionFactoryConfig('specd-edit-change-equivalence')
    fixture = setup.fixture

    const viaConfig = createEditChange(setup.config)
    const viaDeps = createEditChange(resolveEditChangeDeps(createCompositionResolver(setup.config)))

    for (const uc of [viaConfig, viaDeps]) {
      expect(uc).toBeInstanceOf(EditChange)
      await expect(uc.execute({ name: 'missing' })).rejects.toBeInstanceOf(ChangeNotFoundError)
    }
  })
})

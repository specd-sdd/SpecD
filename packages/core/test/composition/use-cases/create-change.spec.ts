import { afterEach, describe, expect, it } from 'vitest'
import { CreateChange } from '../../../src/application/use-cases/create-change.js'
import { DetectOverlap } from '../../../src/application/use-cases/detect-overlap.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
import {
  createCreateChange,
  resolveCreateChangeDeps,
  type CreateChangeDeps,
} from '../../../src/composition/use-cases/create-change.js'
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

describe('createCreateChange', () => {
  it('returns a wired CreateChange instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-create-change')
    fixture = setup.fixture

    expect(createCreateChange(setup.config)).toBeInstanceOf(CreateChange)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: CreateChangeDeps = {
      changes: {} as never,
      listWorkspaces: {} as never,
      actor: {} as never,
      getActiveSchema: {} as never,
      detectOverlap: {} as never,
    }

    expect(createCreateChange(deps)).toBeInstanceOf(CreateChange)
  })

  it('rejects deps plus composition options', () => {
    const deps: CreateChangeDeps = {
      changes: {} as never,
      listWorkspaces: {} as never,
      actor: {} as never,
      getActiveSchema: {} as never,
      detectOverlap: {} as never,
    }

    expect(() =>
      createCreateChange(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })

  it('resolveCreateChangeDeps resolves all CreateChange deps', async () => {
    const setup = await setupCompositionFactoryConfig('specd-resolve-create-change-deps')
    fixture = setup.fixture

    const resolver = createCompositionResolver(setup.config)
    const deps = resolveCreateChangeDeps(resolver)

    expect(Object.keys(deps).sort()).toEqual([
      'actor',
      'changes',
      'detectOverlap',
      'getActiveSchema',
      'listWorkspaces',
    ])
    expect(deps.changes).toBe(resolver.getChangeRepository())
    expect(deps.listWorkspaces).toBe(resolver.getListWorkspaces())
    expect(deps.actor).toBe(resolver.getActorResolver())
    expect(deps.getActiveSchema).toBe(resolver.getGetActiveSchema())
    expect(deps.detectOverlap).toBeInstanceOf(DetectOverlap)

    // Config form wires the same deps shape into CreateChange
    expect(createCreateChange(setup.config)).toBeInstanceOf(CreateChange)
    expect(createCreateChange(deps)).toBeInstanceOf(CreateChange)
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { CreateChange } from '../../../src/application/use-cases/create-change.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createCreateChange,
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
})

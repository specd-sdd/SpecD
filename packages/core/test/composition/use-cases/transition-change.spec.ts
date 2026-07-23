import { afterEach, describe, expect, it } from 'vitest'
import { TransitionChange } from '../../../src/application/use-cases/transition-change.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createTransitionChange,
  type TransitionChangeDeps,
} from '../../../src/composition/use-cases/transition-change.js'
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

describe('createTransitionChange', () => {
  it('returns a wired TransitionChange instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-transition-change')
    fixture = setup.fixture

    expect(createTransitionChange(setup.config)).toBeInstanceOf(TransitionChange)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: TransitionChangeDeps = {
      changes: {} as never,
      actor: {} as never,
      schemaProvider: {} as never,
      runStepHooks: {} as never,
      refreshImplementationTracking: {} as never,
      approvals: { spec: false, signoff: false },
      lifecycle: {} as never,
      countTasks: {} as never,
    }

    expect(createTransitionChange(deps)).toBeInstanceOf(TransitionChange)
  })

  it('rejects deps plus composition options', () => {
    const deps: TransitionChangeDeps = {
      changes: {} as never,
      actor: {} as never,
      schemaProvider: {} as never,
      runStepHooks: {} as never,
      refreshImplementationTracking: {} as never,
      approvals: { spec: false, signoff: false },
      lifecycle: {} as never,
      countTasks: {} as never,
    }

    expect(() =>
      createTransitionChange(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

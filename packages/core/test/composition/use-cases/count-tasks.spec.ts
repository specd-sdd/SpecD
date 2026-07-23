import { afterEach, describe, expect, it } from 'vitest'
import { CountTasks } from '../../../src/application/use-cases/count-tasks.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createCountTasks,
  type CountTasksDeps,
} from '../../../src/composition/use-cases/count-tasks.js'
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

describe('createCountTasks', () => {
  it('returns a wired CountTasks instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-count-tasks')
    fixture = setup.fixture

    expect(createCountTasks(setup.config)).toBeInstanceOf(CountTasks)
  })

  it('accepts explicit dependencies without config bootstrap', () => {
    const deps: CountTasksDeps = { changes: {} as never, schemaProvider: {} as never }

    expect(createCountTasks(deps)).toBeInstanceOf(CountTasks)
  })

  it('rejects dependencies combined with composition options', () => {
    const deps: CountTasksDeps = { changes: {} as never, schemaProvider: {} as never }

    expect(() =>
      createCountTasks(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

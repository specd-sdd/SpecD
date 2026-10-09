import { afterEach, describe, expect, it } from 'vitest'
import { ValidateChangeBatch } from '../../../src/application/use-cases/validate-change-batch.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { createKernel } from '../../../src/composition/kernel.js'
import {
  createValidateChangeBatch,
  type ValidateChangeBatchDeps,
} from '../../../src/composition/use-cases/validate-change-batch.js'
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

describe('createValidateChangeBatch', () => {
  it('returns a wired ValidateChangeBatch instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-validate-change-batch')
    fixture = setup.fixture

    expect(createValidateChangeBatch(setup.config)).toBeInstanceOf(ValidateChangeBatch)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: ValidateChangeBatchDeps = {
      changes: {} as never,
      schemaProvider: {} as never,
      validateArtifacts: {} as never,
    }

    expect(createValidateChangeBatch(deps)).toBeInstanceOf(ValidateChangeBatch)
  })

  it('rejects deps plus composition options', () => {
    const deps: ValidateChangeBatchDeps = {
      changes: {} as never,
      schemaProvider: {} as never,
      validateArtifacts: {} as never,
    }

    expect(() =>
      createValidateChangeBatch(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })

  it('is integrated into Kernel under kernel.changes.validateBatch', async () => {
    const setup = await setupCompositionFactoryConfig('specd-kernel-validate-batch')
    fixture = setup.fixture

    const kernel = await createKernel(setup.config)
    expect(kernel.changes.validateBatch).toBeInstanceOf(ValidateChangeBatch)
  })
})

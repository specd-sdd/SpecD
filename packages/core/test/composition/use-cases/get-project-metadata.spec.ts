import { afterEach, describe, expect, it } from 'vitest'
import { GetProjectMetadata } from '../../../src/application/use-cases/get-project-metadata.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createGetProjectMetadata,
  type GetProjectMetadataDeps,
} from '../../../src/composition/use-cases/get-project-metadata.js'
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

describe('createGetProjectMetadata', () => {
  it('returns a wired GetProjectMetadata instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-get-project-metadata')
    fixture = setup.fixture

    expect(createGetProjectMetadata(setup.config)).toBeInstanceOf(GetProjectMetadata)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: GetProjectMetadataDeps = {
      config: {} as SpecdConfig,
      fileReader: { read: async () => null },
    }

    expect(createGetProjectMetadata(deps)).toBeInstanceOf(GetProjectMetadata)
  })

  it('rejects deps plus composition options', () => {
    const deps: GetProjectMetadataDeps = {
      config: {} as SpecdConfig,
      fileReader: { read: async () => null },
    }

    expect(() =>
      createGetProjectMetadata(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

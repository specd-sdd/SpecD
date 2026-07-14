import { afterEach, describe, expect, it } from 'vitest'
import { ResolveSchema } from '../../../src/application/use-cases/resolve-schema.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createResolveSchema,
  type ResolveSchemaDeps,
} from '../../../src/composition/use-cases/resolve-schema.js'
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

describe('createResolveSchema', () => {
  it('returns a wired ResolveSchema instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-resolve-schema')
    fixture = setup.fixture

    expect(createResolveSchema(setup.config)).toBeInstanceOf(ResolveSchema)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: ResolveSchemaDeps = {
      schemas: {} as never,
      schemaRef: '@specd/schema-std',
    }

    expect(createResolveSchema(deps)).toBeInstanceOf(ResolveSchema)
  })

  it('rejects deps plus composition options', () => {
    const deps: ResolveSchemaDeps = {
      schemas: {} as never,
      schemaRef: '@specd/schema-std',
    }

    expect(() =>
      createResolveSchema(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

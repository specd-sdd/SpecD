import { afterEach, describe, expect, it } from 'vitest'
import { PreviewSpec } from '../../../src/application/use-cases/preview-spec.js'
import { type DiffGenerator } from '../../../src/application/ports/diff-generator.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createPreviewSpec,
  resolvePreviewSpecDeps,
  type PreviewSpecDeps,
} from '../../../src/composition/use-cases/preview-spec.js'
import { createCompositionResolver } from '../../../src/composition/composition-resolver.js'
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

describe('createPreviewSpec', () => {
  it('returns a wired PreviewSpec instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-preview-spec')
    fixture = setup.fixture

    expect(createPreviewSpec(setup.config)).toBeInstanceOf(PreviewSpec)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: PreviewSpecDeps = {
      changes: {} as never,
      specs: new Map(),
      schemaProvider: {} as never,
      parsers: new Map(),
    }

    expect(createPreviewSpec(deps)).toBeInstanceOf(PreviewSpec)
  })

  it('defaults the diff generator for explicit deps when omitted', () => {
    const deps: PreviewSpecDeps = {
      changes: {} as never,
      specs: new Map(),
      schemaProvider: {} as never,
      parsers: new Map(),
    }

    expect(createPreviewSpec(deps)).toBeInstanceOf(PreviewSpec)
  })

  it('preserves an explicit diff generator override', () => {
    const diffGenerator: DiffGenerator = {
      generate(): string {
        return 'diff'
      },
    }
    const deps: PreviewSpecDeps = {
      changes: {} as never,
      specs: new Map(),
      schemaProvider: {} as never,
      parsers: new Map(),
      diffGenerator,
    }

    expect(createPreviewSpec(deps)).toBeInstanceOf(PreviewSpec)
  })

  it('resolves diffGenerator from the composition resolver in config mode', async () => {
    const setup = await setupCompositionFactoryConfig('specd-preview-spec-deps')
    fixture = setup.fixture
    const resolver = createCompositionResolver(setup.config)

    const deps = resolvePreviewSpecDeps(resolver)

    expect(deps.diffGenerator).toBeDefined()
  })

  it('rejects deps plus composition options', () => {
    const deps: PreviewSpecDeps = {
      changes: {} as never,
      specs: new Map(),
      schemaProvider: {} as never,
      parsers: new Map(),
    }

    expect(() =>
      createPreviewSpec(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

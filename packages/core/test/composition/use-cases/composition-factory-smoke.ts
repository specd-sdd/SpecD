import { afterEach, describe, expect, it } from 'vitest'
import { InvalidCompositionFactoryArgumentsError } from '../../../src/domain/errors/invalid-composition-factory-arguments-error.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  cleanupCompositionFactoryConfig,
  setupCompositionFactoryConfig,
  type CompositionFactoryFixture,
} from './helpers.js'

/**
 * Registers smoke tests for a composition factory's dual create forms.
 *
 * @param label - Human-readable factory label for test names
 * @param create - Factory under test
 * @param expectedClass - Expected use-case class constructor
 * @param makeDeps - Builds explicit deps for the deps-only overload
 */
export function describeCompositionFactorySmoke<TDeps, TInstance>(
  label: string,
  create: {
    (deps: TDeps): TInstance
    (config: SpecdConfig, options?: { extraNodeModulesPaths?: string[] }): TInstance
  },
  expectedClass: abstract new (...args: never[]) => TInstance,
  makeDeps: () => TDeps,
): void {
  let fixture: CompositionFactoryFixture = { tmpDir: undefined }

  afterEach(async () => {
    await cleanupCompositionFactoryConfig(fixture)
  })

  describe(`create${label}`, () => {
    it(`returns a wired ${label} instance from SpecdConfig`, async () => {
      const setup = await setupCompositionFactoryConfig(`specd-create-${label.toLowerCase()}`)
      fixture = setup.fixture
      expect(create(setup.config)).toBeInstanceOf(expectedClass)
    })

    it('accepts explicit deps without config bootstrap', () => {
      expect(create(makeDeps())).toBeInstanceOf(expectedClass)
    })

    it('rejects deps plus composition options', () => {
      expect(() =>
        create(makeDeps() as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
      ).toThrow(InvalidCompositionFactoryArgumentsError)
    })
  })
}

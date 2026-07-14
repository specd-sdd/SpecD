import { afterEach, describe, expect, it } from 'vitest'
import { ApproveSpec } from '../../../src/application/use-cases/approve-spec.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createApproveSpec,
  type ApproveSpecDeps,
} from '../../../src/composition/use-cases/approve-spec.js'
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

describe('createApproveSpec', () => {
  it('returns a wired ApproveSpec instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-approve-spec')
    fixture = setup.fixture

    expect(createApproveSpec(setup.config)).toBeInstanceOf(ApproveSpec)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: ApproveSpecDeps = {
      changes: {} as never,
      actor: {} as never,
      schemaProvider: {} as never,
      contentHasher: {} as never,
      approvals: { spec: false, signoff: false },
    }

    expect(createApproveSpec(deps)).toBeInstanceOf(ApproveSpec)
  })

  it('rejects deps plus composition options', () => {
    const deps: ApproveSpecDeps = {
      changes: {} as never,
      actor: {} as never,
      schemaProvider: {} as never,
      contentHasher: {} as never,
      approvals: { spec: false, signoff: false },
    }

    expect(() =>
      createApproveSpec(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

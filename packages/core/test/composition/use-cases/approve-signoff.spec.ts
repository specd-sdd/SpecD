import { afterEach, describe, expect, it } from 'vitest'
import { ApproveSignoff } from '../../../src/application/use-cases/approve-signoff.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import {
  createApproveSignoff,
  type ApproveSignoffDeps,
} from '../../../src/composition/use-cases/approve-signoff.js'
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

describe('createApproveSignoff', () => {
  it('returns a wired ApproveSignoff instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-approve-signoff')
    fixture = setup.fixture

    expect(createApproveSignoff(setup.config)).toBeInstanceOf(ApproveSignoff)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: ApproveSignoffDeps = {
      changes: {} as never,
      actor: {} as never,
      schemaProvider: {} as never,
      contentHasher: {} as never,
      approvals: { spec: false, signoff: false },
    }

    expect(createApproveSignoff(deps)).toBeInstanceOf(ApproveSignoff)
  })

  it('rejects deps plus composition options', () => {
    const deps: ApproveSignoffDeps = {
      changes: {} as never,
      actor: {} as never,
      schemaProvider: {} as never,
      contentHasher: {} as never,
      approvals: { spec: false, signoff: false },
    }

    expect(() =>
      createApproveSignoff(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

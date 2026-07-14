import { afterEach, describe, expect, it } from 'vitest'
import { type SpecdConfig } from '../../../src/application/specd-config.js'
import { GetConfig } from '../../../src/application/use-cases/get-config.js'
import {
  createGetConfig,
  type GetConfigDeps,
} from '../../../src/composition/use-cases/get-config.js'
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

describe('createGetConfig', () => {
  it('returns a wired GetConfig instance from SpecdConfig', async () => {
    const setup = await setupCompositionFactoryConfig('specd-create-get-config')
    fixture = setup.fixture

    expect(createGetConfig(setup.config)).toBeInstanceOf(GetConfig)
  })

  it('accepts explicit deps without config bootstrap', () => {
    const deps: GetConfigDeps = {
      config: {
        projectRoot: '/tmp/project',
        configPath: '/tmp/project/specd.yaml',
        schemaRef: '@specd/schema-std',
        workspaces: [],
        storage: {
          changesPath: '/tmp/project/.specd/changes',
          changesAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/changes' } },
          draftsPath: '/tmp/project/.specd/drafts',
          draftsAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/drafts' } },
          discardedPath: '/tmp/project/.specd/discarded',
          discardedAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/discarded' } },
          archivePath: '/tmp/project/.specd/archive',
          archiveAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/archive' } },
        },
        approvals: { spec: false, signoff: false },
      },
    }

    expect(createGetConfig(deps)).toBeInstanceOf(GetConfig)
  })

  it('rejects deps plus composition options', () => {
    const deps: GetConfigDeps = {
      config: {
        projectRoot: '/tmp/project',
        configPath: '/tmp/project/specd.yaml',
        schemaRef: '@specd/schema-std',
        workspaces: [],
        storage: {
          changesPath: '/tmp/project/.specd/changes',
          changesAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/changes' } },
          draftsPath: '/tmp/project/.specd/drafts',
          draftsAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/drafts' } },
          discardedPath: '/tmp/project/.specd/discarded',
          discardedAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/discarded' } },
          archivePath: '/tmp/project/.specd/archive',
          archiveAdapter: { adapter: 'fs', config: { path: '/tmp/project/.specd/archive' } },
        },
        approvals: { spec: false, signoff: false },
      },
    }

    expect(() =>
      createGetConfig(deps as unknown as SpecdConfig, { extraNodeModulesPaths: [] }),
    ).toThrow(InvalidCompositionFactoryArgumentsError)
  })
})

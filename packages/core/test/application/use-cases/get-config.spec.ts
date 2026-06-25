import { describe, expect, it } from 'vitest'
import { GetConfig } from '../../../src/application/use-cases/get-config.js'
import { createGetConfig } from '../../../src/composition/use-cases/get-config.js'
import { type SpecdConfig } from '../../../src/application/specd-config.js'

/**
 * Minimal valid config for GetConfig unit tests.
 *
 * @returns A {@link SpecdConfig} fixture
 */
function makeConfig(): SpecdConfig {
  return {
    projectRoot: '/tmp/project',
    configPath: '/tmp/project/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath: '/tmp/project/specs',
        specsAdapter: { adapter: 'fs', config: { path: '/tmp/project/specs' } },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: '/tmp/project',
        ownership: 'owned',
        isExternal: false,
      },
    ],
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
  }
}

describe('GetConfig', () => {
  describe('given a valid SpecdConfig', () => {
    it('stores a clone distinct from the constructor argument', () => {
      const config = makeConfig()
      const uc = new GetConfig(config)
      const snapshot = uc.execute()
      expect(snapshot).not.toBe(config)
      expect(snapshot).toEqual(config)
    })

    it('returns the same snapshot reference on repeated execute calls', () => {
      const uc = new GetConfig(makeConfig())
      expect(uc.execute()).toBe(uc.execute())
    })
  })
})

describe('createGetConfig', () => {
  describe('given SpecdConfig input', () => {
    it('returns a GetConfig whose execute output matches the input', () => {
      const config = makeConfig()
      const uc = createGetConfig(config)
      expect(uc.execute()).toEqual(config)
      expect(uc.execute()).not.toBe(config)
    })
  })

  describe('given GetConfigOptions input', () => {
    it('returns a GetConfig wired from options.config', () => {
      const config = makeConfig()
      const uc = createGetConfig({ config })
      expect(uc.execute()).toEqual(config)
    })
  })
})

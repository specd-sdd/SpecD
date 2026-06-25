import { describe, it, expect } from 'vitest'
import { createBootstrapGraphConfig } from '../../../src/application/services/bootstrap-graph-config.js'

describe('createBootstrapGraphConfig', () => {
  it('returns a synthetic default workspace rooted at the VCS root', () => {
    const config = createBootstrapGraphConfig({
      projectRoot: '/tmp/project',
      vcsRoot: '/tmp/project',
    })

    expect(config.workspaces).toHaveLength(1)
    expect(config.workspaces[0]?.name).toBe('default')
    expect(config.workspaces[0]?.codeRoot).toBe('/tmp/project')
    expect(config.projectRoot).toBe('/tmp/project')
    expect(config.configPath).toBe('/tmp/project/.specd/config')
  })
})

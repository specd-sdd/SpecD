import type { SpecdConfig } from '@specd/core'

export function makeMockConfig(projectRoot: string = '/tmp/project'): SpecdConfig {
  return {
    projectRoot,
    configPath: projectRoot + '/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: [
      {
        name: 'default',
        specsPath: projectRoot + '/specs',
        specsAdapter: { adapter: 'fs', config: {} },
        schemasPath: null,
        schemasAdapter: null,
        codeRoot: projectRoot,
        ownership: 'owned',
        isExternal: false,
      },
    ],
    storage: {
      changesPath: projectRoot + '/.specd/changes',
      changesAdapter: { adapter: 'fs', config: {} },
      draftsPath: projectRoot + '/.specd/drafts',
      draftsAdapter: { adapter: 'fs', config: {} },
      discardedPath: projectRoot + '/.specd/discarded',
      discardedAdapter: { adapter: 'fs', config: {} },
      archivePath: projectRoot + '/specs',
      archiveAdapter: { adapter: 'fs', config: {} },
    },
    approvals: { spec: false, signoff: false },
    plugins: { agents: [] },
  }
}

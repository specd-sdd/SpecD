import type {
  AgentPlugin,
  InstallOptions,
  InstallResult,
  PluginContext,
} from '@specd/plugin-manager'

/**
 * Creates the Copilot agent plugin stub.
 *
 * @returns Contract-valid `AgentPlugin`.
 */
export function create(): AgentPlugin {
  return {
    name: '@specd/plugin-agent-copilot',
    type: 'agent',
    version: '0.0.1',
    configSchema: {},
    init(context: PluginContext): Promise<void> {
      void context
      return Promise.resolve()
    },
    destroy(): Promise<void> {
      return Promise.resolve()
    },
    install(projectRoot: string, options?: InstallOptions): Promise<InstallResult> {
      void options
      return Promise.resolve({
        installed: [],
        skipped: [
          { skill: '*', reason: `stub plugin: no install workflow for '${projectRoot}' yet` },
        ],
      })
    },
    uninstall(projectRoot: string, options?: InstallOptions): Promise<void> {
      void projectRoot
      void options
      return Promise.resolve()
    },
  }
}

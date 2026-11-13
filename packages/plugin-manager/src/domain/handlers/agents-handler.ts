import { z } from 'zod'
import { PluginValidationError } from '../errors/plugin-validation.js'
import { isAgentPlugin } from '../types/agent-plugin.js'
import type { ContributionKindHandler } from '../types/contribution-kind-handler.js'
import { CONTRIBUTION_ID_REGEX } from '../types/specd-plugin.js'

/**
 * Install-time handler for the `agents` contribution kind.
 *
 * Agent contributions have no runtime activation.
 */
export const agentsContributionHandler: ContributionKindHandler = {
  kind: 'agents',
  blockSchema: z.record(z.string().regex(CONTRIBUTION_ID_REGEX), z.object({}).strict()),
  validatePlugin(plugin, pluginName): void {
    if (!isAgentPlugin(plugin)) {
      throw new PluginValidationError(pluginName, ['install', 'uninstall'])
    }
  },
}

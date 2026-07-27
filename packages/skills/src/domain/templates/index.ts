import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Resolves the path to the shared agent instruction prompt Handlebars template.
 *
 * @returns Absolute path to `agent-instruction.md.tpl`.
 */
export function getAgentInstructionTemplatePath(): string {
  const candidates = [
    path.resolve(__dirname, '../../templates/prompt/agent-instruction.md.tpl'),
    path.resolve(__dirname, '../../../templates/prompt/agent-instruction.md.tpl'),
    path.resolve(__dirname, '../templates/prompt/agent-instruction.md.tpl'),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return path.resolve(__dirname, '../../templates/prompt/agent-instruction.md.tpl')
}

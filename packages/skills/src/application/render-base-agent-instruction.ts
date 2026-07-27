import { readFile } from 'node:fs/promises'
import Handlebars from 'handlebars'
import { getAgentInstructionTemplatePath } from '../domain/templates/index.js'

/**
 * Options for rendering base agent instructions.
 */
export interface RenderBaseAgentInstructionOptions {
  /**
   * Optional agent-specific extra instructions rendered inside the base prompt block.
   */
  readonly extraInstructions?: string
}

/**
 * Renders the canonical specd base agent instruction prompt with optional extra instructions.
 *
 * @param options - Render options containing optional `extraInstructions`.
 * @returns Rendered instruction prompt string.
 */
export async function renderBaseAgentInstruction(
  options?: RenderBaseAgentInstructionOptions,
): Promise<string> {
  const templatePath = getAgentInstructionTemplatePath()
  const templateSource = await readFile(templatePath, 'utf8')
  const compiled = Handlebars.compile(templateSource)
  const extraInstructions = options?.extraInstructions?.trim()
  return compiled({
    extraInstructions:
      extraInstructions && extraInstructions.length > 0 ? extraInstructions : undefined,
  })
}

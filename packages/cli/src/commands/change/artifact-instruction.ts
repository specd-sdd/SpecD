import { type Command } from 'commander'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'

/**
 * Registers the `change artifact-instruction` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeArtifactInstruction(parent: Command): void {
  parent
    .command('artifact-instruction <name> [artifact-id]')
    .allowExcessArguments(false)
    .description(
      'Return the next artifact instruction for a change, including rules, constraints, and delta guidance for the current lifecycle step.',
    )
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  {
    result: "ok"
    artifactId: string
    rulesPre: string[]
    instruction: string | null
    delta: {
      formatInstructions: string
      domainInstructions: string | null
      outlines: Array<{ specId: string, outline: object }>
    } | null
    rulesPost: string[]
  }
`,
    )
    .action(
      async (
        name: string,
        artifactId: string | undefined,
        opts: { format: string; config?: string },
      ) => {
        try {
          const { kernel } = await resolveCliContext({ configPath: opts.config })

          const result = await kernel.changes.getArtifactInstruction.execute({
            name,
            ...(artifactId !== undefined ? { artifactId } : {}),
          })

          const fmt = parseFormat(opts.format)

          if (fmt === 'text') {
            const hasContent =
              result.rulesPre.length > 0 ||
              result.instruction !== null ||
              result.template !== null ||
              result.delta !== null ||
              result.rulesPost.length > 0

            if (!hasContent) {
              output('no instructions', 'text')
              return
            }

            const sections: string[] = []

            if (result.rulesPre.length > 0) {
              sections.push(`[rules.pre]\n${result.rulesPre.join('\n')}`)
            }

            if (result.instruction !== null) {
              sections.push(`[instruction]\n${result.instruction}`)
            }

            if (result.template !== null) {
              sections.push(`[template]\n${result.template}`)
            }

            if (result.delta !== null) {
              const deltaParts: string[] = []
              deltaParts.push(result.delta.formatInstructions)
              if (result.delta.domainInstructions !== null) {
                deltaParts.push(result.delta.domainInstructions)
              }
              if (result.delta.outlines.length > 0) {
                for (const entry of result.delta.outlines) {
                  deltaParts.push(`${entry.specId}:\n${JSON.stringify(entry.outline, null, 2)}`)
                }
              }
              sections.push(`[delta]\n${deltaParts.join('\n\n')}`)
            }

            if (result.rulesPost.length > 0) {
              sections.push(`[rules.post]\n${result.rulesPost.join('\n')}`)
            }

            output(sections.join('\n\n'), 'text')
          } else {
            output(
              {
                result: 'ok',
                artifactId: result.artifactId,
                rulesPre: result.rulesPre,
                instruction: result.instruction,
                template: result.template,
                delta: result.delta,
                rulesPost: result.rulesPost,
              },
              fmt,
            )
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}

import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { resolveCliContext } from '../../helpers/cli-context.js'

/**
 * Registers the `change approve` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeApprove(parent: Command): void {
  const approveCmd = parent
    .command('approve')
    .description(
      'Approve a change at a lifecycle gate; use sub-commands spec or signoff to record the approval.',
    )

  approveCmd
    .command('spec <name>')
    .allowExcessArguments(false)
    .description(
      'Record a spec approval for a change, satisfying the spec gate in the specd lifecycle.',
    )
    .requiredOption('--reason <text>', 'rationale for approval')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", gate: "spec", name: string }
`,
    )
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({
          configPath: opts.config,
        })

        await kernel.specs.approveSpec.execute({
          name,
          reason: opts.reason,
          approvalsSpec: config.approvals.spec,
        })

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`approved spec for ${name}`, 'text')
        } else {
          output({ result: 'ok', gate: 'spec', name }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })

  approveCmd
    .command('signoff <name>')
    .allowExcessArguments(false)
    .description(
      'Record a sign-off approval for a change, satisfying the signoff gate in the specd lifecycle.',
    )
    .requiredOption('--reason <text>', 'rationale for sign-off')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .addHelpText(
      'after',
      `
JSON/TOON output schema:
  { result: "ok", gate: "signoff", name: string }
`,
    )
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        const { config, kernel } = await resolveCliContext({
          configPath: opts.config,
        })

        await kernel.specs.approveSignoff.execute({
          name,
          reason: opts.reason,
          approvalsSignoff: config.approvals.signoff,
        })

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`approved signoff for ${name}`, 'text')
        } else {
          output({ result: 'ok', gate: 'signoff', name }, fmt)
        }
      } catch (err) {
        handleError(err, opts.format)
      }
    })
}

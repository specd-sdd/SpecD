import { type Command } from 'commander'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { resolveChangeContext } from '../../helpers/change-context.js'

/**
 * Registers the `change approve` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeApprove(parent: Command): void {
  const approveCmd = parent
    .command('approve')
    .description('Approve a change (sub-commands: spec, signoff)')

  approveCmd
    .command('spec <name>')
    .description('Record a spec approval')
    .requiredOption('--reason <text>', 'rationale for approval')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        const { config, kernel, workspaceSchemasPaths } = await resolveChangeContext({
          configPath: opts.config,
        })

        await kernel.specs.approveSpec.execute({
          name,
          reason: opts.reason,
          schemaRef: config.schemaRef,
          workspaceSchemasPaths,
          approvalsSpec: config.approvals.spec,
        })

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`approved spec for ${name}`, 'text')
        } else {
          output({ result: 'ok', gate: 'spec', name }, fmt)
        }
      } catch (err) {
        handleError(err)
      }
    })

  approveCmd
    .command('signoff <name>')
    .description('Record a sign-off')
    .requiredOption('--reason <text>', 'rationale for sign-off')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, opts: { reason: string; format: string; config?: string }) => {
      try {
        const { config, kernel, workspaceSchemasPaths } = await resolveChangeContext({
          configPath: opts.config,
        })

        await kernel.specs.approveSignoff.execute({
          name,
          reason: opts.reason,
          schemaRef: config.schemaRef,
          workspaceSchemasPaths,
          approvalsSignoff: config.approvals.signoff,
        })

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`approved signoff for ${name}`, 'text')
        } else {
          output({ result: 'ok', gate: 'signoff', name }, fmt)
        }
      } catch (err) {
        handleError(err)
      }
    })
}

import { type Command } from 'commander'
import { buildCleanupMap } from '@specd/core'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { hashChangeArtifacts } from '../../helpers/artifact-hash.js'
import { findChangeDir } from '../../helpers/change-dir.js'
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

        const { change } = await kernel.changes.status.execute({ name })
        const changeDir = await findChangeDir(config.storage.changesPath, name)
        const schema = await kernel.specs.getActiveSchema.execute({
          schemaRef: config.schemaRef,
          workspaceSchemasPaths,
        })
        const cleanupMap = buildCleanupMap(schema)
        const artifactHashes =
          changeDir !== null ? await hashChangeArtifacts(changeDir, change, cleanupMap) : {}

        await kernel.specs.approveSpec.execute({
          name,
          reason: opts.reason,
          artifactHashes,
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

        const { change } = await kernel.changes.status.execute({ name })
        const changeDir = await findChangeDir(config.storage.changesPath, name)
        const schema = await kernel.specs.getActiveSchema.execute({
          schemaRef: config.schemaRef,
          workspaceSchemasPaths,
        })
        const cleanupMap = buildCleanupMap(schema)
        const artifactHashes =
          changeDir !== null ? await hashChangeArtifacts(changeDir, change, cleanupMap) : {}

        await kernel.specs.approveSignoff.execute({
          name,
          reason: opts.reason,
          artifactHashes,
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

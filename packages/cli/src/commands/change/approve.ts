import { type Command } from 'commander'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { hashChangeArtifacts } from '../../helpers/artifact-hash.js'
import { findChangeDir } from '../../helpers/change-dir.js'
import { buildWorkspaceSchemasPaths } from '../../helpers/workspace-map.js'
import { type PreHashCleanup } from '@specd/core'

/**
 * Builds a map of artifact type → preHashCleanup rules from the active schema.
 *
 * @param kernel - The CLI kernel instance
 * @param config - The resolved project configuration
 * @returns A map of artifact type ID to cleanup rules
 */
async function buildCleanupMap(
  kernel: ReturnType<typeof import('../../kernel.js').createCliKernel>,
  config: Awaited<ReturnType<typeof import('../../load-config.js').loadConfig>>,
): Promise<ReadonlyMap<string, readonly PreHashCleanup[]>> {
  try {
    const workspaceSchemasPaths = buildWorkspaceSchemasPaths(config)
    const schema = await kernel.specs.getActiveSchema.execute({
      schemaRef: config.schemaRef,
      workspaceSchemasPaths,
    })
    const map = new Map<string, readonly PreHashCleanup[]>()
    for (const a of schema.artifacts()) {
      const cleanups = a.preHashCleanup()
      if (cleanups.length > 0) {
        map.set(a.id(), cleanups)
      }
    }
    return map
  } catch {
    return new Map()
  }
}

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
        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)

        const { change } = await kernel.changes.status.execute({ name })
        const changeDir = await findChangeDir(config.storage.changesPath, name)
        const cleanupMap = await buildCleanupMap(kernel, config)
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
        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)

        const { change } = await kernel.changes.status.execute({ name })
        const changeDir = await findChangeDir(config.storage.changesPath, name)
        const cleanupMap = await buildCleanupMap(kernel, config)
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

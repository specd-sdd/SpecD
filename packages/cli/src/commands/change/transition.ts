import { type Command } from 'commander'
import { type ChangeState, VALID_TRANSITIONS, SpecPath, parseMetadata } from '@specd/core'
import { createCliKernel } from '../../kernel.js'
import { loadConfig } from '../../load-config.js'
import { output, parseFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { parseSpecId } from '../../helpers/spec-path.js'

/** All valid `ChangeState` values. */
const VALID_STATES = Object.keys(VALID_TRANSITIONS) as ChangeState[]

/**
 * Registers the `change transition` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerChangeTransition(parent: Command): void {
  parent
    .command('transition <name> <step>')
    .description('Transition a change to a new lifecycle state')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (name: string, step: string, opts: { format: string; config?: string }) => {
      try {
        if (!(VALID_STATES as string[]).includes(step)) {
          process.stderr.write(
            `error: invalid state '${step}'. valid states: ${VALID_STATES.join(', ')}\n`,
          )
          process.exit(1)
        }

        const config = await loadConfig({ configPath: opts.config })
        const kernel = createCliKernel(config)

        const { change: statusBefore } = await kernel.changes.status.execute({ name })
        const fromState = statusBefore.state

        // Resolve contextSpecIds for designing → ready from dependsOn metadata
        let contextSpecIds: string[] | undefined
        if (fromState === 'designing') {
          const deps = new Set<string>()
          for (const specId of statusBefore.specIds) {
            const parsed = parseSpecId(specId, config)
            const result = await kernel.specs.get.execute({
              workspace: parsed.workspace,
              specPath: SpecPath.parse(parsed.capabilityPath),
            })
            if (result === null || result === undefined) continue
            const metadataArtifact = result.artifacts.get('.specd-metadata.yaml')
            if (metadataArtifact === undefined) continue
            try {
              const metadata = parseMetadata(metadataArtifact.content)
              if (metadata.dependsOn) {
                for (const dep of metadata.dependsOn) deps.add(dep)
              }
            } catch {
              // Skip specs with unparseable metadata
            }
          }
          if (deps.size > 0) contextSpecIds = [...deps]
        }

        const change = await kernel.changes.transition.execute({
          name,
          to: step as ChangeState,
          approvalsSpec: config.approvals.spec,
          approvalsSignoff: config.approvals.signoff,
          ...(contextSpecIds !== undefined ? { contextSpecIds } : {}),
        })

        const fmt = parseFormat(opts.format)
        if (fmt === 'text') {
          output(`transitioned ${name}: ${fromState} → ${change.state}`, 'text')
        } else {
          output({ result: 'ok', name, from: fromState, to: change.state }, fmt)
        }
      } catch (err) {
        handleError(err)
      }
    })
}

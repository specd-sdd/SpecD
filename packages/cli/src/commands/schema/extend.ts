import fs from 'node:fs/promises'
import path from 'node:path'
import { type Command } from 'commander'
import { type SchemaRawResult } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { cliError, handleError } from '../../handle-error.js'

/**
 * Registers the `schema extend` subcommand on the given parent command.
 * @param parent - The parent Commander command to register on
 */
export function registerSchemaExtend(parent: Command): void {
  parent
    .command('extend <ref> <name>')
    .allowExcessArguments(false)
    .description(
      'Create a new local extension schema that inherits from an existing schema, allowing selective overrides without forking.',
    )
    .option('--workspace <workspace>', 'target workspace')
    .option('--output <path>', 'output directory path')
    .option('--config <path>', 'path to specd.yaml')
    .action(
      async (
        ref: string,
        name: string,
        opts: { workspace?: string; output?: string; config?: string },
      ) => {
        try {
          if (opts.workspace !== undefined && opts.output !== undefined) {
            cliError('--workspace and --output are mutually exclusive', undefined, 1, 'CLI_ERROR')
          }

          const { config, kernel } = await resolveCliContext({ configPath: opts.config })

          // Resolve source schema to verify it exists
          const raw: SchemaRawResult | null = await kernel.schemas.resolveRaw(ref)
          if (raw === null) {
            cliError(`schema '${ref}' not found`, undefined, 3, 'SCHEMA_NOT_FOUND')
          }

          // Verify source is not a schema-plugin
          if (raw.data.kind === 'schema-plugin') {
            cliError(
              `'${ref}' is a schema-plugin and cannot be extended; only schemas with kind 'schema' can be extended`,
              undefined,
              1,
              'CLI_ERROR',
            )
          }

          // Determine target directory
          let targetDir: string
          if (opts.output !== undefined) {
            targetDir = path.resolve(opts.output)
          } else {
            const workspaceName = opts.workspace ?? 'default'
            const targetWs = config.workspaces.find((ws) => ws.name === workspaceName)
            const targetSchemasPath = targetWs?.schemasPath ?? undefined
            if (targetSchemasPath === undefined) {
              cliError(
                `workspace '${workspaceName}' has no schemas directory configured`,
                undefined,
                1,
                'CLI_ERROR',
              )
            }
            targetDir = path.join(targetSchemasPath, name)
          }

          // Check target doesn't already exist
          try {
            await fs.access(targetDir)
            cliError(`target directory '${targetDir}' already exists`, undefined, 1, 'CLI_ERROR')
          } catch {
            // Expected — directory doesn't exist
          }

          // Create target directory and minimal schema.yaml
          await fs.mkdir(targetDir, { recursive: true })

          const yaml = [
            `kind: schema`,
            `name: ${name}`,
            `version: 1`,
            `extends: '${ref}'`,
            `artifacts: []`,
            '',
          ].join('\n')

          await fs.writeFile(path.join(targetDir, 'schema.yaml'), yaml, 'utf-8')

          process.stdout.write(`${targetDir}\n`)
        } catch (err) {
          handleError(err)
        }
      },
    )
}

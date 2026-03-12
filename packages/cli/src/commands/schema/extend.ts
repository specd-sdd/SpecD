import fs from 'node:fs/promises'
import path from 'node:path'
import { type Command } from 'commander'
import { type SpecdConfig, createSchemaRegistry, type SchemaRawResult } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { cliError, handleError } from '../../handle-error.js'

/**
 * Creates a filesystem-backed schema registry from the given config.
 * @param config - The specd configuration providing project root paths
 * @returns A schema registry instance configured for filesystem access
 */
function buildSchemaRegistry(config: SpecdConfig) {
  return createSchemaRegistry('fs', {
    nodeModulesPaths: [path.join(config.projectRoot, 'node_modules')],
    configDir: config.projectRoot,
  })
}

/**
 * Builds a map of workspace names to their schema directory paths.
 * @param config - The specd configuration containing workspace definitions
 * @returns A map from workspace name to schemas path
 */
function buildWorkspaceSchemasPaths(config: SpecdConfig): Map<string, string> {
  const map = new Map<string, string>()
  for (const ws of config.workspaces) {
    if (ws.schemasPath !== null) {
      map.set(ws.name, ws.schemasPath)
    }
  }
  return map
}

/**
 * Registers the `schema extend` subcommand on the given parent command.
 * @param parent - The parent Commander command to register on
 */
export function registerSchemaExtend(parent: Command): void {
  parent
    .command('extend <ref>')
    .allowExcessArguments(false)
    .description('Create a new local schema that extends an existing schema')
    .option('--name <name>', 'name for the new schema')
    .option('--workspace <workspace>', 'target workspace', 'default')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (ref: string, opts: { name?: string; workspace: string; config?: string }) => {
      try {
        const { config } = await resolveCliContext({ configPath: opts.config })
        const registry = buildSchemaRegistry(config)
        const wsPaths = buildWorkspaceSchemasPaths(config)

        // Resolve source schema to verify it exists
        const raw: SchemaRawResult | null = await registry.resolveRaw(ref, wsPaths)
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

        // Determine target
        const targetSchemasPath = wsPaths.get(opts.workspace)
        if (targetSchemasPath === undefined) {
          cliError(
            `workspace '${opts.workspace}' has no schemas directory configured`,
            undefined,
            1,
            'CLI_ERROR',
          )
        }

        const schemaName = opts.name ?? `${raw.data.name}-custom`
        const targetDir = path.join(targetSchemasPath, schemaName)

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
          `name: ${schemaName}`,
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
    })
}

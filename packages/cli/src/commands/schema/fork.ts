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
 * Registers the `schema fork` subcommand on the given parent command.
 * @param parent - The parent Commander command to register on
 */
export function registerSchemaFork(parent: Command): void {
  parent
    .command('fork <ref>')
    .allowExcessArguments(false)
    .description('Fork a schema into the project as an independent local copy')
    .option('--name <name>', 'name for the forked schema')
    .option('--workspace <workspace>', 'target workspace', 'default')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (ref: string, opts: { name?: string; workspace: string; config?: string }) => {
      try {
        const { config } = await resolveCliContext({ configPath: opts.config })
        const registry = buildSchemaRegistry(config)
        const wsPaths = buildWorkspaceSchemasPaths(config)

        // Resolve source schema
        const raw: SchemaRawResult | null = await registry.resolveRaw(ref, wsPaths)
        if (raw === null) {
          cliError(`schema '${ref}' not found`, undefined, 3, 'SCHEMA_NOT_FOUND')
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

        const schemaName = opts.name ?? raw.data.name
        const targetDir = path.join(targetSchemasPath, schemaName)

        // Check target doesn't already exist
        try {
          await fs.access(targetDir)
          cliError(`target directory '${targetDir}' already exists`, undefined, 1, 'CLI_ERROR')
        } catch {
          // Expected — directory doesn't exist
        }

        // Copy source directory to target
        const sourceDir = path.dirname(raw.resolvedPath)
        await fs.cp(sourceDir, targetDir, { recursive: true })

        // Update the copied schema.yaml: ensure kind: schema, remove extends
        const targetSchemaPath = path.join(targetDir, 'schema.yaml')
        let content = await fs.readFile(targetSchemaPath, 'utf-8')
        // Remove extends line if present
        content = content.replace(/^extends:.*\n?/m, '')
        // Ensure kind: schema is present (it should be, but just in case)
        if (!/^kind:/m.test(content)) {
          content = `kind: schema\n${content}`
        }
        await fs.writeFile(targetSchemaPath, content, 'utf-8')

        process.stdout.write(`${targetDir}\n`)
      } catch (err) {
        handleError(err)
      }
    })
}

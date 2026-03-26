import fs from 'node:fs/promises'
import path from 'node:path'
import { type Command } from 'commander'
import {
  type SpecdConfig,
  createSchemaRegistry,
  createSchemaRepository,
  type SchemaRawResult,
} from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { cliError, handleError } from '../../handle-error.js'

/**
 * Creates a filesystem-backed schema registry from the given config.
 * @param config - The specd configuration providing project root paths
 * @returns A schema registry instance configured for filesystem access
 */
function buildSchemaRegistry(config: SpecdConfig) {
  const schemaRepositories = buildSchemaRepositories(config)
  return createSchemaRegistry('fs', {
    nodeModulesPaths: [path.join(config.projectRoot, 'node_modules')],
    configDir: config.projectRoot,
    schemaRepositories,
  })
}

/**
 * Builds a map of workspace names to their SchemaRepository instances.
 * @param config - The specd configuration containing workspace definitions
 * @returns A map from workspace name to SchemaRepository
 */
function buildSchemaRepositories(config: SpecdConfig) {
  const map = new Map<string, ReturnType<typeof createSchemaRepository>>()
  for (const ws of config.workspaces) {
    if (ws.schemasPath !== null) {
      map.set(
        ws.name,
        createSchemaRepository(
          'fs',
          { workspace: ws.name, ownership: ws.ownership, isExternal: ws.isExternal },
          { schemasPath: ws.schemasPath },
        ),
      )
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
    .description(
      'Fork a schema into the project as an independent local copy, allowing full customization without inheriting future upstream changes.',
    )
    .option('--name <name>', 'name for the forked schema')
    .option('--workspace <workspace>', 'target workspace', 'default')
    .option('--config <path>', 'path to specd.yaml')
    .action(async (ref: string, opts: { name?: string; workspace: string; config?: string }) => {
      try {
        const { config } = await resolveCliContext({ configPath: opts.config })
        const registry = buildSchemaRegistry(config)

        // Resolve source schema
        const raw: SchemaRawResult | null = await registry.resolveRaw(ref)
        if (raw === null) {
          cliError(`schema '${ref}' not found`, undefined, 3, 'SCHEMA_NOT_FOUND')
        }

        // Determine target
        const targetWs = config.workspaces.find((ws) => ws.name === opts.workspace)
        const targetSchemasPath = targetWs?.schemasPath ?? undefined
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

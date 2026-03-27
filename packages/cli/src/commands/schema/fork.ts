import fs from 'node:fs/promises'
import path from 'node:path'
import { type Command } from 'commander'
import { type SchemaRawResult } from '@specd/core'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { cliError, handleError } from '../../handle-error.js'

/**
 * Registers the `schema fork` subcommand on the given parent command.
 * @param parent - The parent Commander command to register on
 */
export function registerSchemaFork(parent: Command): void {
  parent
    .command('fork <ref> <name>')
    .allowExcessArguments(false)
    .description(
      'Fork a schema into the project as an independent local copy, allowing full customization without inheriting future upstream changes.',
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
          const { config, kernel } = await resolveCliContext({ configPath: opts.config })

          // Mutual exclusion check
          if (opts.workspace !== undefined && opts.output !== undefined) {
            cliError('--workspace and --output are mutually exclusive', undefined, 1, 'CLI_ERROR')
          }

          // Resolve source schema via kernel registry
          const raw: SchemaRawResult | null = await kernel.schemas.resolveRaw(ref)
          if (raw === null) {
            cliError(`schema '${ref}' not found`, undefined, 3, 'SCHEMA_NOT_FOUND')
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

          // Create target directory
          await fs.mkdir(targetDir, { recursive: true })

          // Read source schema.yaml and rewrite: set name, ensure kind, remove extends
          let content = await fs.readFile(raw.resolvedPath, 'utf-8')
          content = content.replace(/^extends:.*\n?/m, '')
          content = content.replace(/^name:.*$/m, `name: ${name}`)
          if (!/^kind:/m.test(content)) {
            content = `kind: schema\n${content}`
          }
          await fs.writeFile(path.join(targetDir, 'schema.yaml'), content, 'utf-8')

          // Copy templates from source
          for (const [relPath, templateContent] of raw.templates) {
            const dest = path.join(targetDir, relPath)
            await fs.mkdir(path.dirname(dest), { recursive: true })
            await fs.writeFile(dest, templateContent, 'utf-8')
          }

          process.stdout.write(`${targetDir}\n`)
        } catch (err) {
          handleError(err)
        }
      },
    )
}

import { type Command } from 'commander'
import { createInitProject, createVcsAdapter } from '@specd/core'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import { renderBanner } from '../../banner.js'
import { CLI_VERSION, CORE_VERSION } from '../../version.js'
import * as path from 'node:path'
import { collect } from '../../helpers/collect.js'
import { fileExists } from '../../helpers/file-exists.js'
import { resolveCliContext } from '../../helpers/cli-context.js'
import { installPluginsWithKernel } from '../plugins/install.js'

const AVAILABLE_AGENT_PLUGINS = [
  '@specd/plugin-agent-claude',
  '@specd/plugin-agent-copilot',
  '@specd/plugin-agent-codex',
] as const

/**
 * Resolves the project root to the VCS repository root when inside a repo,
 * falling back to the current working directory otherwise.
 *
 * @returns The absolute path to the project root.
 */
async function resolveProjectRoot(): Promise<string> {
  try {
    const vcs = await createVcsAdapter()
    return await vcs.rootDir()
  } catch {
    return process.cwd()
  }
}

/**
 * Registers the `project init` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectInit(parent: Command): void {
  parent
    .command('init')
    .allowExcessArguments(false)
    .description('Initialize a new specd project and optionally install plugins.')
    .option('--schema <ref>', 'schema reference (e.g. @specd/schema-std)')
    .option('--workspace <id>', 'default workspace ID', 'default')
    .option('--workspace-path <path>', 'path to specs directory', 'specs/')
    .option('--plugin <name>', 'plugin to install after init (repeatable)', collect, [])
    .option('--force', 'overwrite existing specd.yaml')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(
      async (opts: {
        schema?: string
        workspace: string
        workspacePath: string
        plugin: string[]
        force?: boolean
        format: string
      }) => {
        try {
          const fmt = parseFormat(opts.format)
          if (fmt === 'text') {
            process.stdout.write(
              renderBanner({ cliVersion: CLI_VERSION, coreVersion: CORE_VERSION }) + '\n\n',
            )
          }

          const hasFlags =
            opts.schema !== undefined ||
            opts.workspace !== 'default' ||
            opts.workspacePath !== 'specs/' ||
            opts.plugin.length > 0
          const interactive = process.stdout.isTTY === true && fmt === 'text' && !hasFlags
          if (interactive) {
            await runInteractiveInit({ format: fmt, force: opts.force === true })
            return
          }

          const projectRoot = await resolveProjectRoot()
          const schemaRef = opts.schema ?? '@specd/schema-std'
          const init = createInitProject()
          const initResult = await init.execute({
            projectRoot,
            schemaRef,
            workspaceId: opts.workspace,
            specsPath: opts.workspacePath,
            ...(opts.force === true ? { force: true } : {}),
          })

          const installed = await installSelectedPlugins({
            projectRoot,
            configPath: initResult.configPath,
            pluginNames: opts.plugin,
          })

          if (fmt === 'text') {
            output(`initialized specd in ${projectRoot}`, 'text')
            for (const entry of installed.plugins) {
              output(`plugins: ${entry.status} ${entry.name} (${entry.detail})`, 'text')
            }
          } else {
            output(
              {
                result: 'ok',
                configPath: initResult.configPath,
                schema: initResult.schemaRef,
                workspaces: initResult.workspaces,
                plugins: installed.plugins,
              },
              fmt,
            )
          }

          if (installed.hasErrors) {
            process.exit(1)
          }
        } catch (error) {
          handleError(error, opts.format)
        }
      },
    )
}

/**
 * Installs selected plugins after successful initialization.
 *
 * @param input - Install input values.
 * @param input.projectRoot - Absolute project root.
 * @param input.configPath - Absolute path to `specd.yaml`.
 * @param input.pluginNames - Plugin package names to install.
 * @returns Install batch result.
 */
async function installSelectedPlugins(input: {
  readonly projectRoot: string
  readonly configPath: string
  readonly pluginNames: readonly string[]
}): Promise<Awaited<ReturnType<typeof installPluginsWithKernel>>> {
  if (input.pluginNames.length === 0) {
    return { plugins: [], hasErrors: false }
  }
  const { kernel } = await resolveCliContext({ configPath: input.configPath })
  return installPluginsWithKernel({
    kernel,
    projectRoot: input.projectRoot,
    configPath: input.configPath,
    pluginNames: input.pluginNames,
  })
}

/**
 * Runs interactive project initialization with plugin selection.
 *
 * @param options - Interactive mode options.
 * @param options.format - Output format.
 * @param options.force - Whether overwrite is pre-approved.
 */
async function runInteractiveInit(options: {
  readonly format: OutputFormat
  readonly force: boolean
}): Promise<void> {
  const { intro, text, multiselect, confirm, isCancel, outro } = await import('@clack/prompts')

  const projectRoot = await resolveProjectRoot()
  const defaultConfigPath = path.join(projectRoot, 'specd.yaml')
  intro('specd project init')

  const schema = await text({
    message: 'Schema reference',
    initialValue: '@specd/schema-std',
    validate: (value) => (value.trim().length === 0 ? 'Schema cannot be empty.' : undefined),
  })
  if (isCancel(schema)) {
    outro('Cancelled.')
    process.exit(0)
  }

  const workspace = await text({
    message: 'Default workspace ID',
    initialValue: 'default',
    validate: (value) =>
      /^[a-z][a-z0-9-]*$/.test(value.trim())
        ? undefined
        : 'Use lowercase letters, numbers, and hyphens only.',
  })
  if (isCancel(workspace)) {
    outro('Cancelled.')
    process.exit(0)
  }

  const workspacePath = await text({
    message: 'Specs path',
    initialValue: 'specs/',
    validate: (value) => (value.trim().length === 0 ? 'Path cannot be empty.' : undefined),
  })
  if (isCancel(workspacePath)) {
    outro('Cancelled.')
    process.exit(0)
  }

  const selectedPlugins = await multiselect({
    message: 'Select plugins to install',
    options: AVAILABLE_AGENT_PLUGINS.map((name) => ({ label: name, value: name })),
    required: false,
  })
  if (isCancel(selectedPlugins)) {
    outro('Cancelled.')
    process.exit(0)
  }

  const overwriteNeeded = await fileExists(defaultConfigPath)
  let force = options.force
  if (overwriteNeeded && !force) {
    const overwrite = await confirm({
      message: `specd.yaml already exists at ${defaultConfigPath}. Overwrite it?`,
    })
    if (isCancel(overwrite) || !overwrite) {
      outro('Cancelled.')
      process.exit(0)
    }
    force = true
  }

  const init = createInitProject()
  const initResult = await init.execute({
    projectRoot,
    schemaRef: String(schema),
    workspaceId: String(workspace),
    specsPath: String(workspacePath),
    force,
  })

  const installed = await installSelectedPlugins({
    projectRoot,
    configPath: initResult.configPath,
    pluginNames: Array.isArray(selectedPlugins) ? (selectedPlugins as string[]) : [],
  })

  if (options.format === 'text') {
    output(`initialized specd in ${projectRoot}`, 'text')
    for (const entry of installed.plugins) {
      output(`plugins: ${entry.status} ${entry.name} (${entry.detail})`, 'text')
    }
  } else {
    output(
      {
        result: 'ok',
        configPath: initResult.configPath,
        schema: initResult.schemaRef,
        workspaces: initResult.workspaces,
        plugins: installed.plugins,
      },
      options.format,
    )
  }

  if (installed.hasErrors) {
    process.exit(1)
  }
}

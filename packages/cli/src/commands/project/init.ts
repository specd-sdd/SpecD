import { type Command } from 'commander'
import { createInitProject, createRecordSkillInstall, createVcsAdapter } from '@specd/core'
import { listSkills } from '@specd/skills'
import { output, parseFormat, type OutputFormat } from '../../formatter.js'
import { handleError } from '../../handle-error.js'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { KNOWN_AGENTS } from '../../helpers/known-agents.js'
import { fileExists } from '../../helpers/file-exists.js'
import { collect } from '../../helpers/collect.js'

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
 * Installs all skills for the given agents, writes files and records in specd.yaml.
 *
 * @param agents - Agent identifiers to install skills for.
 * @param projectRoot - Absolute path to the project root.
 * @param configPath - Absolute path to specd.yaml.
 * @returns A map of agent id to array of installed skill names.
 */
async function installSkillsForAgents(
  agents: readonly string[],
  projectRoot: string,
  configPath: string,
): Promise<Record<string, string[]>> {
  if (agents.length === 0) return {}
  const allSkills = listSkills()
  if (allSkills.length === 0) return {}

  const recordUseCase = createRecordSkillInstall()
  const result: Record<string, string[]> = {}

  for (const agentId of agents) {
    const agentConfig = KNOWN_AGENTS[agentId]
    if (agentConfig === undefined) continue

    const commandsDir = agentConfig.projectDir(projectRoot)
    await fs.mkdir(commandsDir, { recursive: true })

    const names: string[] = []
    for (const skill of allSkills) {
      const filePath = path.join(commandsDir, `${skill.name}.md`)
      await fs.writeFile(filePath, skill.content, 'utf8')
      names.push(skill.name)
    }

    await recordUseCase.execute({ configPath, agent: agentId, skillNames: names })
    result[agentId] = names
  }

  return result
}

/**
 * Registers the `project init` subcommand on the given parent command.
 *
 * @param parent - The parent Commander command to attach the subcommand to.
 */
export function registerProjectInit(parent: Command): void {
  parent
    .command('init')
    .description('Initialise a new SpecD project')
    .option('--schema <ref>', 'schema reference (e.g. @specd/schema-std)')
    .option('--workspace <id>', 'default workspace ID', 'default')
    .option('--workspace-path <path>', 'path to specs directory', 'specs/')
    .option('--agent <id>', 'agent to install skills for (repeatable)', collect, [])
    .option('--force', 'overwrite existing specd.yaml')
    .option('--format <fmt>', 'output format: text|json|toon', 'text')
    .action(
      async (opts: {
        schema?: string
        workspace: string
        workspacePath: string
        agent: string[]
        force?: boolean
        format: string
      }) => {
        try {
          const fmt = parseFormat(opts.format)
          const hasConfigFlags = opts.schema !== undefined || opts.agent.length > 0

          const isInteractive = process.stdout.isTTY === true && fmt === 'text' && !hasConfigFlags

          const projectRoot = await resolveProjectRoot()
          const configPath = path.join(projectRoot, 'specd.yaml')

          if (isInteractive) {
            await runInteractiveInit({ projectRoot, configPath, fmt, opts })
          } else {
            const schemaRef = opts.schema ?? '@specd/schema-std'
            const useCase = createInitProject()
            const result = await useCase.execute({
              projectRoot,
              schemaRef,
              workspaceId: opts.workspace,
              specsPath: opts.workspacePath,
              ...(opts.force !== undefined ? { force: opts.force } : {}),
            })

            const skillsInstalled = await installSkillsForAgents(
              opts.agent,
              projectRoot,
              result.configPath,
            )

            if (fmt === 'text') {
              output(`initialized specd in ${projectRoot}`, 'text')
              for (const [agentId, names] of Object.entries(skillsInstalled)) {
                for (const name of names) {
                  output(
                    `installed ${name} → ${KNOWN_AGENTS[agentId]!.projectDir(projectRoot)}/${name}.md`,
                    'text',
                  )
                }
              }
            } else {
              output(
                {
                  result: 'ok',
                  configPath: result.configPath,
                  schema: result.schemaRef,
                  workspaces: result.workspaces,
                  skillsInstalled,
                },
                fmt,
              )
            }
          }
        } catch (err) {
          handleError(err, opts.format)
        }
      },
    )
}

/**
 * Runs the interactive TTY wizard for project initialisation.
 *
 * @param args - The initialisation arguments.
 * @param args.projectRoot - The absolute path to the project root (dirname of configPath).
 * @param args.configPath - The absolute path where specd.yaml will be written.
 * @param args.fmt - The output format.
 * @param args.opts - The CLI option values.
 * @param args.opts.schema - Optional schema reference override.
 * @param args.opts.workspace - The default workspace ID.
 * @param args.opts.workspacePath - The path to the specs directory.
 * @param args.opts.force - Whether to overwrite an existing specd.yaml.
 */
async function runInteractiveInit(args: {
  projectRoot: string
  configPath: string
  fmt: OutputFormat
  opts: { schema?: string; workspace: string; workspacePath: string; force?: boolean }
}): Promise<void> {
  const { intro, text, select, multiselect, confirm, spinner, outro, note, isCancel } =
    await import('@clack/prompts')

  intro(' SpecD · project init ')

  // ── Purpose ──────────────────────────────────────────────────────────────
  note(
    [
      'This wizard will set up SpecD in your project by creating a',
      'specd.yaml configuration file and the directory structure for',
      'your specs.',
      '',
      'SpecD organises your work around specs — structured documents',
      'that describe what to build before anyone writes code. Each spec',
      'lives through a workflow (designing → implementing → ready) and',
      'can be reviewed and approved by humans or AI agents.',
      '',
      'Steps in this wizard:',
      '  1. Config path — where specd.yaml will be saved',
      '  2. Schema      — the ruleset that defines your spec structure',
      '  3. Workspace   — a logical group of specs (team or domain)',
      '  4. Specs path  — where spec folders will live on disk',
      '  5. Agents      — which AI agents will work in this project',
    ].join('\n'),
    'Welcome to SpecD',
  )

  const proceed = await confirm({ message: 'Ready to continue?' })
  if (isCancel(proceed) || !proceed) {
    outro('Cancelled.')
    process.exit(0)
  }

  // ── Step 1: Config path ───────────────────────────────────────────────────
  note(
    [
      'specd.yaml is the configuration file for your project. It records',
      'the schema, workspaces, and other settings SpecD needs to operate.',
      '',
      'It is usually placed at the root of your repository so that SpecD',
      'can find it automatically when you run commands from any subdirectory.',
      '',
      'The project root will be set to the directory containing this file.',
    ].join('\n'),
    'Step 1 of 5 — Config path',
  )

  const configPathInput = await text({
    message: 'Where should specd.yaml be saved?',
    initialValue: args.configPath,
    placeholder: path.join(process.cwd(), 'specd.yaml'),
    validate: (v) => (v.trim().length === 0 ? 'Path cannot be empty.' : undefined),
  })
  if (isCancel(configPathInput)) {
    outro('Cancelled.')
    process.exit(0)
  }

  let resolvedConfigPath = path.resolve(String(configPathInput))
  let resolvedProjectRoot = path.dirname(resolvedConfigPath)

  const alreadyExists = await fileExists(resolvedConfigPath)
  if (alreadyExists) {
    note(
      [
        `A specd.yaml already exists at:`,
        `  ${resolvedConfigPath}`,
        '',
        'If you continue, you will be asked at the end whether to',
        'overwrite it. Your current configuration will be replaced.',
      ].join('\n'),
      'Existing configuration detected',
    )
  }

  // ── Step 2: Schema ───────────────────────────────────────────────────────
  note(
    [
      'A schema defines the artifacts each spec must have (e.g. spec.md,',
      'design.md, verify.md) and the workflow states a change moves through.',
      '',
      'Most projects use @specd/schema-std, the standard schema that ships',
      'with SpecD. You can switch schemas later by editing specd.yaml.',
    ].join('\n'),
    'Step 2 of 5 — Schema',
  )

  const schemaChoice = await select({
    message: 'Which schema do you want to use?',
    options: [
      {
        value: '@specd/schema-std',
        label: '@specd/schema-std',
        hint: 'recommended — standard spec structure',
      },
      {
        value: 'custom',
        label: 'Custom schema',
        hint: 'enter a package name or local path',
      },
    ],
  })
  if (isCancel(schemaChoice)) {
    outro('Cancelled.')
    process.exit(0)
  }

  let schemaRef = String(schemaChoice)
  if (schemaChoice === 'custom') {
    const customSchema = await text({
      message: 'Schema reference (npm package or local path)',
      placeholder: '@my-org/specd-schema',
      validate: (v) => (v.trim().length === 0 ? 'Schema reference cannot be empty.' : undefined),
    })
    if (isCancel(customSchema)) {
      outro('Cancelled.')
      process.exit(0)
    }
    schemaRef = String(customSchema)
  }

  // ── Step 3: Workspace ────────────────────────────────────────────────────
  note(
    [
      'A workspace is a logical group of specs, usually aligned to a team,',
      'domain, or service. Specs inside a workspace share the same schema',
      'and live under the same directory.',
      '',
      'Small projects typically have one workspace called "default".',
      'Larger projects may have several (e.g. "auth", "billing", "infra").',
      'You can add more workspaces later by editing specd.yaml.',
    ].join('\n'),
    'Step 3 of 5 — Workspace',
  )

  const workspaceId = await text({
    message: 'Default workspace name',
    initialValue: 'default',
    placeholder: 'default',
    validate: (v) =>
      /^[a-z][a-z0-9-]*$/.test(v.trim())
        ? undefined
        : 'Use lowercase letters, numbers, and hyphens only.',
  })
  if (isCancel(workspaceId)) {
    outro('Cancelled.')
    process.exit(0)
  }

  // ── Step 4: Specs path ───────────────────────────────────────────────────
  note(
    [
      'This is the root directory where SpecD will store all spec folders.',
      'Each spec gets its own subdirectory, e.g.:',
      '',
      `  <specs-path>/<workspace>/<spec-name>/spec.md`,
      `  <specs-path>/<workspace>/<spec-name>/verify.md`,
      '',
      'The path is relative to your project root.',
    ].join('\n'),
    'Step 4 of 5 — Specs path',
  )

  const specsPath = await text({
    message: 'Specs directory (relative to project root)',
    initialValue: 'specs/',
    placeholder: 'specs/',
    validate: (v) => (v.trim().length === 0 ? 'Path cannot be empty.' : undefined),
  })
  if (isCancel(specsPath)) {
    outro('Cancelled.')
    process.exit(0)
  }

  // ── Step 5: Agents ───────────────────────────────────────────────────────
  note(
    [
      'SpecD ships with skills — markdown files that teach AI agents how',
      'to use SpecD commands. Selecting an agent here will install the',
      'skill files into the right location for that agent to pick them up.',
      '',
      '  Claude Code    →  .claude/commands/',
      '  GitHub Copilot →  .github/copilot-instructions.md',
      '  Codex          →  .codex/instructions.md',
      '',
      'You can install or update skills later with: specd skills install',
    ].join('\n'),
    'Step 5 of 5 — AI agents',
  )

  const agents = await multiselect({
    message: 'Which AI agents will work in this project?',
    options: [
      { value: 'claude', label: 'Claude Code', hint: 'recommended' },
      { value: 'copilot', label: 'GitHub Copilot' },
      { value: 'codex', label: 'Codex' },
    ],
    required: false,
  })
  if (isCancel(agents)) {
    outro('Cancelled.')
    process.exit(0)
  }

  // ── Summary & confirm ────────────────────────────────────────────────────
  const agentList =
    Array.isArray(agents) && agents.length > 0 ? (agents as string[]).join(', ') : 'none'

  const action = alreadyExists ? 'overwrite' : 'create'
  note(
    [
      `  config path  ${resolvedConfigPath}`,
      `  schema       ${schemaRef}`,
      `  workspace    ${String(workspaceId)}  →  ${String(specsPath)}${String(workspaceId)}/`,
      `  agents       ${agentList}`,
      '',
      `Will ${action} specd.yaml at:`,
      `  ${resolvedConfigPath}`,
    ].join('\n'),
    'Summary',
  )

  let force = false
  if (alreadyExists) {
    const overwrite = await confirm({ message: 'Overwrite the existing specd.yaml?' })
    if (isCancel(overwrite)) {
      outro('Cancelled.')
      process.exit(0)
    }

    if (!overwrite) {
      const useDifferent = await confirm({ message: 'Save it with a different path instead?' })
      if (isCancel(useDifferent) || !useDifferent) {
        outro('Cancelled.')
        process.exit(0)
      }

      const newPathInput = await text({
        message: 'New path for specd.yaml',
        initialValue: resolvedConfigPath,
        validate: (v) => (v.trim().length === 0 ? 'Path cannot be empty.' : undefined),
      })
      if (isCancel(newPathInput)) {
        outro('Cancelled.')
        process.exit(0)
      }

      resolvedConfigPath = path.resolve(String(newPathInput))
      resolvedProjectRoot = path.dirname(resolvedConfigPath)
    } else {
      force = true
    }
  }

  const ok = await confirm({ message: 'Initialize SpecD with these settings?' })
  if (isCancel(ok) || !ok) {
    outro('Cancelled.')
    process.exit(0)
  }

  // ── Run ──────────────────────────────────────────────────────────────────
  const s = spinner()
  s.start('Initializing project…')

  const useCase = createInitProject()
  const result = await useCase.execute({
    projectRoot: resolvedProjectRoot,
    schemaRef,
    workspaceId: String(workspaceId),
    specsPath: String(specsPath),
    force,
  })

  // Install skills for selected agents
  const selectedAgents = Array.isArray(agents) ? (agents as string[]) : []
  if (selectedAgents.length > 0) {
    s.message('Installing skills…')
    await installSkillsForAgents(selectedAgents, resolvedProjectRoot, result.configPath)
  }

  s.stop('Project initialized.')
  outro(`initialized specd in ${resolvedProjectRoot}`)
}

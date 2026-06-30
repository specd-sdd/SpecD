import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import { createSkillRepository, ResolveBundle } from '@specd/skills'
import type {
  AgentInstallOptions,
  AgentInstallResult,
  TemplateVariable,
} from '@specd/plugin-manager'
import type { Frontmatter } from '../../domain/types/frontmatter.js'
import { skillFrontmatter, agentFrontmatter } from '../../domain/frontmatter/index.js'
import { resolveSharedFolder } from './shared-folder.js'

/**
 * Installs selected skills into Codex's project-local skills directory.
 */
export class InstallSkills {
  /**
   * Installs one or more skills for Codex.
   *
   * @param config - Project configuration.
   * @param options - Install options.
   * @returns Install summary.
   */
  async execute(config: SpecdConfig, options?: AgentInstallOptions): Promise<AgentInstallResult> {
    const repository = createSkillRepository()
    const availableItems = await repository.list()

    const requestedSkills =
      options?.skills !== undefined && options.skills.length > 0
        ? options.skills
        : availableItems.filter((s) => s.kind === 'skill').map((skill) => skill.name)

    const requestedAgents =
      options?.agents !== undefined && options.agents.length > 0
        ? options.agents
        : availableItems.filter((s) => s.kind === 'agent').map((agent) => agent.name)

    const requestedNames = [...requestedSkills, ...requestedAgents]

    const skillsTargetDir = path.join(config.projectRoot, '.codex', 'skills')
    const agentsTargetDir = path.join(config.projectRoot, '.codex', 'agents')
    const resolvedSharedFolder = resolveSharedFolder(
      config.projectRoot,
      config.configPath,
      typeof options?.variables?.['sharedFolder'] === 'string'
        ? options.variables['sharedFolder']
        : undefined,
    )
    const sharedDir = resolvedSharedFolder.absolutePath

    await mkdir(skillsTargetDir, { recursive: true })
    await mkdir(agentsTargetDir, { recursive: true })

    const installed: Array<{ skill: string; path: string }> = []
    const skipped: Array<{ skill: string; reason: string }> = []

    // Codex capabilities
    const capabilities = ['mcp', 'agents', 'frontmatter']

    for (const name of requestedNames) {
      const item = await repository.get(name)
      if (item === undefined) {
        skipped.push({ skill: name, reason: 'item not found' })
        continue
      }

      const resolveBundle = new ResolveBundle(repository)
      const { bundle } = await resolveBundle.execute({
        name,
        config,
        context: {
          variables: {
            ...(options?.variables ?? {}),
            // Frontmatter only for standard skills
            ...(item.kind === 'skill'
              ? {
                  frontmatter: toTemplateVariables(
                    skillFrontmatter[name] ??
                      ({ name, description: item.description } satisfies Frontmatter),
                  ),
                }
              : {}),
          },
          capabilities,
        },
      })
      if (bundle.files.length === 0) {
        skipped.push({ skill: name, reason: 'bundle has no files' })
        continue
      }

      let itemTargetDir: string
      if (item.kind === 'skill') {
        itemTargetDir = path.join(skillsTargetDir, name)
        const legacyFile = path.join(skillsTargetDir, `${name}.md`)
        await mkdir(itemTargetDir, { recursive: true })
        await rm(legacyFile, { force: true })
      } else {
        itemTargetDir = agentsTargetDir
      }

      for (const file of bundle.files) {
        const isAgentInAgentsDir = item.kind === 'agent' && !file.shared
        const baseDir = file.shared === true ? sharedDir : itemTargetDir

        let finalFilename = file.filename
        let content = file.content

        if (isAgentInAgentsDir) {
          // Codex convention for agents: flattened in agents/ directory as .toml
          finalFilename = `${name}.toml`

          // Codex agent wrapper: TOML + escaped instructions
          const metadata =
            agentFrontmatter[name] ??
            ({ name, description: item.description } satisfies Frontmatter)
          const tomlLines = [
            `name = ${JSON.stringify(metadata.name ?? name)}`,
            `description = ${JSON.stringify(metadata.description ?? item.description)}`,
            'developer_instructions = """',
            content.replace(/"""/g, '\\"\\"\\"').trim(),
            '"""',
          ]
          content = tomlLines.join('\n')
        }

        const outputPath = path.join(baseDir, finalFilename)
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, content, 'utf8')
      }

      installed.push({
        skill: name,
        path:
          item.kind === 'skill'
            ? path.join(skillsTargetDir, name)
            : path.join(agentsTargetDir, `${name}.toml`),
      })
    }

    return { installed, skipped }
  }
}

/**
 * Converts plugin frontmatter data into recursive template variables.
 *
 * @param frontmatter - Runtime-specific frontmatter object.
 * @returns Recursive template variable map.
 */
function toTemplateVariables(frontmatter: Frontmatter): Readonly<Record<string, TemplateVariable>> {
  const entries = Object.entries(frontmatter)
    .map(([key, value]) => [key, normalizeTemplateVariable(value)] as const)
    .filter((entry): entry is readonly [string, TemplateVariable] => entry[1] !== undefined)

  return Object.fromEntries(entries)
}

/**
 * Normalizes a runtime value into a template-variable-compatible shape.
 *
 * @param value - Runtime metadata value.
 * @returns Recursive template variable, or `undefined` when absent.
 */
function normalizeTemplateVariable(value: unknown): TemplateVariable | undefined {
  if (value === undefined) {
    return undefined
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeTemplateVariable(entry))
      .filter((entry): entry is TemplateVariable => entry !== undefined)
  }
  if (typeof value === 'object' && value !== null) {
    const nestedEntries = Object.entries(value)
      .map(([key, entry]) => [key, normalizeTemplateVariable(entry)] as const)
      .filter((entry): entry is readonly [string, TemplateVariable] => entry[1] !== undefined)
    return Object.fromEntries(nestedEntries)
  }
  if (typeof value === 'bigint') {
    return value.toString()
  }
  if (typeof value === 'symbol') {
    return value.description ?? 'symbol'
  }
  if (typeof value === 'function') {
    return value.name.length > 0 ? value.name : 'function'
  }
  return undefined
}

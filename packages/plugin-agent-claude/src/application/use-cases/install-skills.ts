import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import {
  addSharedOwner,
  createSkillRepository,
  injectSpecdBlock,
  renderBaseAgentInstruction,
  ResolveBundle,
  resolveSharedFolder,
} from '@specd/skills'
import type {
  AgentInstallOptions,
  AgentInstallResult,
  TemplateVariable,
} from '@specd/plugin-manager'
import type { Frontmatter } from '../../domain/types/frontmatter.js'
import { skillFrontmatter, agentFrontmatter } from '../../domain/frontmatter/index.js'

/**
 * Installs selected skills into Claude's project-local skills directory.
 */
export class InstallSkills {
  /**
   * Installs one or more skills for Claude.
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

    const skillsTargetDir = path.join(config.projectRoot, '.claude', 'skills')
    const resolvedSharedFolder = resolveSharedFolder(
      config.projectRoot,
      config.configPath,
      typeof options?.variables?.['sharedFolder'] === 'string'
        ? options.variables['sharedFolder']
        : undefined,
    )
    const sharedDir = resolvedSharedFolder.absolutePath
    const capabilities = options?.capabilities ?? ['mcp', 'agents', 'frontmatter']
    const supportsAgents = capabilities.includes('agents')
    const agentsTargetDir = supportsAgents
      ? path.join(config.projectRoot, '.claude', 'agents')
      : sharedDir

    await mkdir(skillsTargetDir, { recursive: true })
    if (supportsAgents) {
      await mkdir(agentsTargetDir, { recursive: true })
    }

    const installed: Array<{ skill: string; path: string }> = []
    const skipped: Array<{ skill: string; reason: string }> = []
    let ownerRegistered = false

    for (const name of requestedNames) {
      const item = await repository.get(name)
      if (item === undefined) {
        skipped.push({ skill: name, reason: 'item not found' })
        continue
      }

      let agentFrontmatterVars: Record<string, unknown> | undefined = undefined
      if (item.kind === 'agent') {
        const metadata =
          agentFrontmatter[name] ?? ({ name, description: item.description } satisfies Frontmatter)
        agentFrontmatterVars = {
          name: metadata.name ?? name,
          description: metadata.description ?? item.description,
          ...(metadata.allowed_tools ? { tools: metadata.allowed_tools } : {}),
          ...(item.metadata.model ? { model: item.metadata.model } : {}),
        }
      }

      const resolveBundle = new ResolveBundle(repository)
      const { bundle } = await resolveBundle.execute({
        name,
        config,
        context: {
          variables: {
            ...(options?.variables ?? {}),
            ...(item.kind === 'skill'
              ? {
                  frontmatter: toTemplateVariables(
                    skillFrontmatter[name] ??
                      ({ description: item.description } satisfies Frontmatter),
                    SKILL_YAML_KEYS,
                  ),
                }
              : {
                  ...(agentFrontmatterVars
                    ? {
                        frontmatter: toTemplateVariables(
                          agentFrontmatterVars as unknown as Frontmatter,
                        ),
                      }
                    : {}),
                }),
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
        const content = file.content

        if (isAgentInAgentsDir) {
          finalFilename = supportsAgents ? `${name}.md` : `${name}.agent.md`
        }

        const outputPath = path.join(baseDir, finalFilename)
        if ((file.shared === true || baseDir === sharedDir) && !ownerRegistered) {
          // Register ownership before the first shared write so a partial failure still leaves the marker.
          await addSharedOwner(sharedDir, 'claude')
          ownerRegistered = true
        }
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, content, 'utf8')
      }

      installed.push({
        skill: name,
        path:
          item.kind === 'skill'
            ? path.join(skillsTargetDir, name)
            : path.join(agentsTargetDir, supportsAgents ? `${name}.md` : `${name}.agent.md`),
      })
    }

    // Inject prompt block into CLAUDE.md with registered plugin tag
    const claudeMdPath = path.join(config.projectRoot, 'CLAUDE.md')
    const prompt = await renderBaseAgentInstruction()
    await injectSpecdBlock(claudeMdPath, prompt, 'claude')

    return { installed, skipped }
  }
}

/**
 * Claude Code reads hyphenated skill frontmatter keys; the internal value model keeps snake_case.
 */
const SKILL_YAML_KEYS: Readonly<Record<string, string>> = {
  allowed_tools: 'allowed-tools',
  argument_hint: 'argument-hint',
  disable_model_invocation: 'disable-model-invocation',
  user_invocable: 'user-invocable',
}

/**
 * Converts plugin frontmatter data into recursive template variables.
 *
 * @param frontmatter - Runtime-specific frontmatter object.
 * @param keyMap - Optional internal-key to YAML-key renames.
 * @returns Recursive template variable map.
 */
function toTemplateVariables(
  frontmatter: Frontmatter,
  keyMap: Readonly<Record<string, string>> = {},
): Readonly<Record<string, TemplateVariable>> {
  const entries = Object.entries(frontmatter)
    .map(([key, value]) => [keyMap[key] ?? key, normalizeTemplateVariable(value)] as const)
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

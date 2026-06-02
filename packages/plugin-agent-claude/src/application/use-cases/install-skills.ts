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
import { skillFrontmatter } from '../../domain/frontmatter/index.js'
import { resolveSharedFolder } from './shared-folder.js'

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
    const availableSkills = repository.list()
    const requestedSkills =
      options?.skills !== undefined && options.skills.length > 0
        ? options.skills
        : availableSkills.map((skill) => skill.name)

    const targetDir = path.join(config.projectRoot, '.claude', 'skills')
    const resolvedSharedFolder = resolveSharedFolder(
      config.projectRoot,
      config.configPath,
      typeof options?.variables?.['sharedFolder'] === 'string'
        ? options.variables['sharedFolder']
        : undefined,
    )
    const sharedDir = resolvedSharedFolder.absolutePath
    await mkdir(targetDir, { recursive: true })

    const installed: Array<{ skill: string; path: string }> = []
    const skipped: Array<{ skill: string; reason: string }> = []

    for (const skillName of requestedSkills) {
      const skill = repository.get(skillName)
      if (skill === undefined) {
        skipped.push({ skill: skillName, reason: 'skill not found' })
        continue
      }

      const frontmatter =
        skillFrontmatter[skillName] ?? ({ description: skill.description } satisfies Frontmatter)
      const resolveBundle = new ResolveBundle(repository)
      const { bundle } = await resolveBundle.execute({
        name: skillName,
        config,
        context: {
          variables: {
            ...(options?.variables ?? {}),
            frontmatter: toTemplateVariables(frontmatter),
          },
          capabilities: buildCapabilities(true, true, true),
        },
      })
      if (bundle.files.length === 0) {
        skipped.push({ skill: skillName, reason: 'bundle has no files' })
        continue
      }

      const skillDir = path.join(targetDir, skillName)
      const legacyFile = path.join(targetDir, `${skillName}.md`)
      await mkdir(skillDir, { recursive: true })
      await rm(legacyFile, { force: true })

      for (const file of bundle.files) {
        const baseDir = file.shared === true ? sharedDir : skillDir
        const outputPath = path.join(baseDir, file.filename)
        await mkdir(path.dirname(outputPath), { recursive: true })
        await writeFile(outputPath, file.content, 'utf8')
      }

      installed.push({ skill: skillName, path: skillDir })
    }

    return { installed, skipped }
  }
}

/**
 * Converts runtime capability flags into install-time capability entries.
 *
 * @param mcp - Whether the runtime supports MCP-backed skills.
 * @param agents - Whether the runtime supports agent or subagent flows.
 * @param frontmatter - Whether the runtime expects generated skill frontmatter.
 * @returns Structured capability entries.
 */
function buildCapabilities(mcp: boolean, agents: boolean, frontmatter: boolean): readonly string[] {
  return [
    ...(mcp ? ['mcp'] : []),
    ...(agents ? ['agents'] : []),
    ...(frontmatter ? ['frontmatter'] : []),
  ]
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

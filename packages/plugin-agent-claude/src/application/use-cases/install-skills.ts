import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import { createSkillRepository } from '@specd/skills'
import type { AgentInstallOptions, AgentInstallResult } from '@specd/plugin-manager'
import type { Frontmatter } from '../../domain/types/frontmatter.js'
import { skillFrontmatter } from '../../domain/frontmatter/index.js'

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
    await mkdir(targetDir, { recursive: true })

    const installed: Array<{ skill: string; path: string }> = []
    const skipped: Array<{ skill: string; reason: string }> = []

    for (const skillName of requestedSkills) {
      const skill = repository.get(skillName)
      if (skill === undefined) {
        skipped.push({ skill: skillName, reason: 'skill not found' })
        continue
      }

      const bundle = repository.getBundle(skillName, options?.variables, config)
      if (bundle.files.length === 0) {
        skipped.push({ skill: skillName, reason: 'bundle has no files' })
        continue
      }

      const frontmatter =
        skillFrontmatter[skillName] ?? ({ description: skill.description } satisfies Frontmatter)
      const skillDir = path.join(targetDir, skillName)
      const legacyFile = path.join(targetDir, `${skillName}.md`)
      await mkdir(skillDir, { recursive: true })
      await rm(legacyFile, { force: true })

      for (const file of bundle.files) {
        const outputPath = path.join(skillDir, file.filename)
        const content = file.filename.endsWith('.md')
          ? renderFrontmatter(frontmatter, file.content)
          : file.content
        await writeFile(outputPath, content, 'utf8')
      }

      installed.push({ skill: skillName, path: skillDir })
    }

    return { installed, skipped }
  }
}

/**
 * Prepends YAML frontmatter to markdown content.
 *
 * @param frontmatter - Frontmatter values.
 * @param content - Markdown body.
 * @returns Frontmatter + body content.
 */
function renderFrontmatter(frontmatter: Frontmatter, content: string): string {
  const lines: string[] = ['---']
  appendYamlField(lines, 'name', frontmatter.name)
  appendYamlField(lines, 'description', frontmatter.description)
  appendYamlField(lines, 'allowed_tools', frontmatter.allowed_tools)
  appendYamlField(lines, 'argument_hint', frontmatter.argument_hint)
  appendYamlField(lines, 'when_to_use', frontmatter.when_to_use)
  appendYamlField(lines, 'disable_model_invocation', frontmatter.disable_model_invocation)
  appendYamlField(lines, 'user_invocable', frontmatter.user_invocable)
  appendYamlField(lines, 'model', frontmatter.model)
  appendYamlField(lines, 'effort', frontmatter.effort)
  appendYamlField(lines, 'context', frontmatter.context)
  appendYamlField(lines, 'agent', frontmatter.agent)
  appendYamlField(lines, 'hooks', frontmatter.hooks)
  appendYamlField(lines, 'paths', frontmatter.paths)
  appendYamlField(lines, 'shell', frontmatter.shell)
  lines.push('---', '', content)
  return `${lines.join('\n')}\n`
}

/**
 * Appends one YAML field when a value is present.
 *
 * @param lines - Mutable YAML lines collection.
 * @param key - YAML key.
 * @param value - Field value.
 * @returns Nothing.
 */
function appendYamlField(lines: string[], key: string, value: unknown): void {
  if (value === undefined) {
    return
  }
  lines.push(`${key}: ${JSON.stringify(value)}`)
}

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { SpecdConfig } from '@specd/core'
import { createSkillRepository } from '@specd/skills'
import type { AgentInstallOptions, AgentInstallResult } from '@specd/plugin-manager'
import type { Frontmatter } from '../../domain/types/frontmatter.js'
import { skillFrontmatter } from '../../domain/frontmatter/index.js'

/**
 * Installs selected skills into the Agent Skills standard project-local skills directory.
 */
export class InstallSkills {
  /**
   * Installs one or more skills for the Agent Skills standard.
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

    const targetDir = path.join(config.projectRoot, '.agents', 'skills')
    const sharedDir = path.join(targetDir, '_specd-shared')
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
        skillFrontmatter[skillName] ??
        ({ name: skillName, description: skill.description } satisfies Frontmatter)
      const skillDir = path.join(targetDir, skillName)
      const legacyFile = path.join(targetDir, `${skillName}.md`)
      await mkdir(skillDir, { recursive: true })
      await rm(legacyFile, { force: true })

      for (const file of bundle.files) {
        const baseDir = file.shared === true ? sharedDir : skillDir
        const outputPath = path.join(baseDir, file.filename)
        await mkdir(path.dirname(outputPath), { recursive: true })
        const content =
          file.filename.endsWith('.md') && file.shared !== true
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
  appendYamlField(lines, 'license', frontmatter.license)
  appendYamlField(lines, 'compatibility', frontmatter.compatibility)
  appendYamlField(lines, 'metadata', frontmatter.metadata)
  appendYamlField(lines, 'allowed-tools', frontmatter['allowed-tools'])
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

import { describe, expect, it } from 'vitest'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createSkillRepository } from '../../src/index.js'
import { InvalidSkillTemplateMetadataError } from '../../src/domain/errors/invalid-skill-template-metadata-error.js'

async function createTempTemplatesRoot(): Promise<string> {
  const root = path.join(tmpdir(), `specd-skills-test-${Date.now()}`)
  await mkdir(root, { recursive: true })
  return root
}

describe('Skill & Repository Domain', () => {
  it('given SkillTemplate, when getContent is called, then it loads template lazily and returns Promise<string>', async () => {
    const templatesRoot = await createTempTemplatesRoot()
    const skillDir = path.join(templatesRoot, 'skills', 'test-lazy')
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, 'SKILL.md.tpl'), 'lazy content', 'utf8')
    await writeFile(
      path.join(skillDir, 'skill.meta.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'test-lazy',
        description: 'Lazy skill',
        supportedCapabilities: [],
        requiredCapabilities: [],
        requiredSharedTemplates: [],
      }),
      'utf8',
    )

    try {
      const repository = createSkillRepository({ templatesRoot })
      const skill = await repository.get('test-lazy')

      expect(skill).toBeDefined()
      const template = skill!.templates[0]!
      expect(template.filename).toBe('SKILL.md.tpl')

      // Verify it returns a Promise<string>
      const contentPromise = template.getContent()
      expect(contentPromise).toBeInstanceOf(Promise)
      const content = await contentPromise
      expect(content).toBe('lazy content')
    } finally {
      await rm(templatesRoot, { recursive: true, force: true })
    }
  })

  it('given missing required capabilities, when getBundle is called, then throws InvalidSkillTemplateMetadataError', async () => {
    const templatesRoot = await createTempTemplatesRoot()
    const skillDir = path.join(templatesRoot, 'skills', 'test-caps')
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, 'SKILL.md.tpl'), 'content', 'utf8')
    await writeFile(
      path.join(skillDir, 'skill.meta.json'),
      JSON.stringify({
        schemaVersion: 1,
        name: 'test-caps',
        description: 'Caps skill',
        supportedCapabilities: ['mcp'],
        requiredCapabilities: ['mcp'],
        requiredSharedTemplates: [],
      }),
      'utf8',
    )

    try {
      const repository = createSkillRepository({ templatesRoot })

      // Fails when capability is missing
      await expect(repository.getBundle('test-caps', { capabilities: [] })).rejects.toThrow(
        InvalidSkillTemplateMetadataError,
      )

      // Passes when capability is provided
      const bundle = await repository.getBundle('test-caps', { capabilities: ['mcp'] })
      expect(bundle).toBeDefined()
    } finally {
      await rm(templatesRoot, { recursive: true, force: true })
    }
  })
})

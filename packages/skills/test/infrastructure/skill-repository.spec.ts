import { describe, expect, it } from 'vitest'
import { createSkillRepository } from '../../src/index.js'

describe('createSkillRepository', () => {
  it('given canonical templates, when list is called, then returns metadata-only skills', async () => {
    const repository = createSkillRepository()
    const skills = await repository.list()

    expect(skills.length).toBeGreaterThan(0)
    expect(skills.some((skill) => skill.name === 'specd')).toBe(true)
    expect(skills.every((skill) => skill.templates.length > 0)).toBe(true)
  })

  it('given a valid skill name, when get is called, then returns that skill', async () => {
    const repository = createSkillRepository()
    const skill = await repository.get('specd')

    expect(skill).toBeDefined()
    expect(skill?.name).toBe('specd')
  })

  it('given a missing skill name, when get is called, then returns undefined', async () => {
    const repository = createSkillRepository()
    const skill = await repository.get('does-not-exist')

    expect(skill).toBeUndefined()
  })

  it('given templates migrated to .md.tpl, when list is called, then metadata still loads', async () => {
    const repository = createSkillRepository()
    const skill = await repository.get('specd')

    expect(skill?.templates.some((template) => template.filename === 'SKILL.md.tpl')).toBe(true)
  })

  it('given unresolved variables, when getBundle is called, then placeholders are preserved', async () => {
    const repository = createSkillRepository()
    const bundle = await repository.getBundle('specd', {
      variables: { change_name: 'demo' },
    })

    expect(bundle.files.length).toBeGreaterThan(0)
    expect(bundle.files[0]?.content.length).toBeGreaterThan(0)
    expect(bundle.files.some((file) => file.filename === 'shared.md')).toBe(true)
    expect(bundle.files.some((file) => file.filename === 'SKILL.md')).toBe(true)
    expect(bundle.files.find((file) => file.filename === 'shared.md')?.shared).toBe(true)
    expect(bundle.files.find((file) => file.filename === 'SKILL.md')?.shared).not.toBe(true)
  })

  it('given variables.frontmatter without frontmatter capability, when getBundle is called, then frontmatter is not emitted', async () => {
    const repository = createSkillRepository()
    const bundle = await repository.getBundle('specd', {
      variables: {
        frontmatter: {
          name: 'specd',
          description: 'specd',
        },
      },
    })

    const skillFile = bundle.files.find((file) => file.filename === 'SKILL.md')
    expect(skillFile?.content.startsWith('---\n')).toBe(false)
  })

  it('given variables.frontmatter with frontmatter capability, when getBundle is called, then frontmatter is emitted only for non-shared files', async () => {
    const repository = createSkillRepository()
    const bundle = await repository.getBundle('specd', {
      variables: {
        frontmatter: {
          name: 'specd',
          description: 'specd',
        },
      },
      capabilities: ['frontmatter'],
    })

    const skillFile = bundle.files.find((file) => file.filename === 'SKILL.md')
    const sharedFile = bundle.files.find((file) => file.filename === 'shared.md')

    expect(skillFile?.content.startsWith('---\n')).toBe(true)
    expect(sharedFile?.content.startsWith('---\n')).toBe(false)
  })

  it('given capability-aware shared templates, when getBundle is called, then handlebars else blocks do not leak into output', async () => {
    const repository = createSkillRepository()
    const codexBundle = await repository.getBundle('specd', {
      capabilities: ['mcp', 'agents'],
    })
    const standardBundle = await repository.getBundle('specd', {
      capabilities: [],
    })

    const codexShared = codexBundle.files.find((file) => file.filename === 'shared.md')?.content
    const standardShared = standardBundle.files.find(
      (file) => file.filename === 'shared.md',
    )?.content

    expect(codexShared).toContain('This runtime supports MCP-oriented workflows.')
    expect(codexShared).toContain('This runtime supports delegated agent workflows.')
    expect(codexShared).not.toContain('{{else}}')
    expect(codexShared).not.toContain('This runtime does not expose MCP-oriented workflows.')
    expect(standardShared).toContain('This runtime does not expose MCP-oriented workflows.')
    expect(standardShared).toContain('This runtime does not support delegated agent workflows.')
    expect(standardShared).not.toContain('{{else}}')
    expect(standardShared).not.toContain('This runtime supports MCP-oriented workflows.')
  })

  it('given shared templates, when listSharedFiles is called, then returns shared file entries', async () => {
    const repository = createSkillRepository()
    const sharedFiles = await repository.listSharedFiles()
    const shared = sharedFiles.find((file) => file.filename === 'shared.md')

    expect(shared).toBeDefined()
    expect(shared?.content.length).toBeGreaterThan(0)
  })

  it('given shared workflow guidance, when read, then includes command freshness and review guardrails', async () => {
    const repository = createSkillRepository()
    const sharedFiles = await repository.listSharedFiles()
    const shared = sharedFiles.find((file) => file.filename === 'shared.md')

    expect(shared?.content).toContain('Command necessity and freshness')
    expect(shared?.content).toContain('Structural validation vs content review')
    expect(shared?.content).toContain('specd changes validate')
    expect(shared?.content).toContain('specd changes spec-preview')
  })
})

import { describe, expect, it } from 'vitest'
import { createSkillRepository } from '../../src/index.js'

describe('createSkillRepository', () => {
  it('given canonical templates, when list is called, then returns metadata-only skills and agents', async () => {
    const repository = createSkillRepository()
    const all = await repository.list()

    expect(all.length).toBeGreaterThan(0)
    expect(all.some((s) => s.name === 'specd' && s.kind === 'skill')).toBe(true)
    expect(
      all.some((s) => s.name === 'specd-project-context-optimizer' && s.kind === 'agent'),
    ).toBe(true)
    expect(all.some((s) => s.name === 'specd-spec-context-optimizer' && s.kind === 'agent')).toBe(
      true,
    )
    expect(all.every((s) => s.templates.length > 0)).toBe(true)
  })

  it('given a valid skill name, when get is called, then returns that skill with kind: skill', async () => {
    const repository = createSkillRepository()
    const skill = await repository.get('specd')

    expect(skill).toBeDefined()
    expect(skill?.name).toBe('specd')
    expect(skill?.kind).toBe('skill')
  })

  it('given a valid agent name, when get is called, then returns that agent with kind: agent', async () => {
    const repository = createSkillRepository()
    const agent = await repository.get('specd-project-context-optimizer')

    expect(agent).toBeDefined()
    expect(agent?.name).toBe('specd-project-context-optimizer')
    expect(agent?.kind).toBe('agent')
  })

  it('given a missing name, when get is called, then returns undefined', async () => {
    const repository = createSkillRepository()
    const item = await repository.get('does-not-exist')

    expect(item).toBeUndefined()
  })

  it('given skill templates migrated to .md.tpl, when list is called, then metadata still loads', async () => {
    const repository = createSkillRepository()
    const skill = await repository.get('specd')

    expect(skill?.templates.some((template) => template.filename === 'SKILL.md.tpl')).toBe(true)
  })

  it('given agent templates using custom convention, when list is called, then SPECD-AGENT.md.tpl is found', async () => {
    const repository = createSkillRepository()
    const agent = await repository.get('specd-project-context-optimizer')

    expect(agent?.templates.some((template) => template.filename === 'SPECD-AGENT.md.tpl')).toBe(
      true,
    )
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

  it('given agent bundle resolution, when getBundle is called, then SPECD-AGENT.md is emitted', async () => {
    const repository = createSkillRepository()
    const bundle = await repository.getBundle('specd-project-context-optimizer')

    expect(bundle.files.some((file) => file.filename === 'SPECD-AGENT.md')).toBe(true)
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

  it('given capability-aware shared templates, when getBundle is called, then output contains prose policies', async () => {
    const repository = createSkillRepository()
    const bundle = await repository.getBundle('specd', {
      capabilities: ['agents'],
    })

    const shared = bundle.files.find((file) => file.filename === 'shared.md')?.content
    expect(shared).toContain('Context Optimization Policy')
    expect(shared).toContain('launch the `specd-project-context-optimizer`')
  })

  it('given shared templates, when listSharedFiles is called, then returns shared file entries', async () => {
    const repository = createSkillRepository()
    const sharedFiles = await repository.listSharedFiles()
    const shared = sharedFiles.find((file) => file.filename === 'shared.md')

    expect(shared).toBeDefined()
    expect(shared?.content.length).toBeGreaterThan(0)
  })
})

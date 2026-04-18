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

  it('given variables, when getBundle is called, then unresolved placeholders are preserved', async () => {
    const repository = createSkillRepository()
    const bundle = await repository.getBundle('specd', { change_name: 'demo' })

    expect(bundle.files.length).toBeGreaterThan(0)
    expect(bundle.files[0]?.content.length).toBeGreaterThan(0)
    expect(bundle.files.some((file) => file.filename === 'shared.md')).toBe(true)
  })

  it('given shared metadata, when listSharedFiles is called, then returns shared file entries', async () => {
    const repository = createSkillRepository()
    const sharedFiles = await repository.listSharedFiles()
    const shared = sharedFiles.find((file) => file.filename === 'shared.md')

    expect(shared).toBeDefined()
    expect(shared?.skills.includes('specd')).toBe(true)
    expect(shared?.content.length).toBeGreaterThan(0)
  })
})

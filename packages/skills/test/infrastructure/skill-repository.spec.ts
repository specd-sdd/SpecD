import { describe, expect, it } from 'vitest'
import { createSkillRepository } from '../../src/index.js'

function decisionRow(content: string, mode: '`change`' | '`delegated`'): string[] {
  const row = content.split('\n').find((line) => line.startsWith(`| ${mode} |`))
  if (!row) throw new Error(`Missing rendered decision row for ${mode}`)
  return row
    .split('|')
    .slice(2, -1)
    .map((cell) => cell.trim())
}

describe('createSkillRepository', () => {
  it('given workflow templates, when rendered, then verification commands survive bundling', async () => {
    const repository = createSkillRepository()
    const verify = await repository.getBundle('specd-verify')
    const compliance = await repository.getBundle('specd-compliance')
    const verifyBody = verify.files.find((file) => file.filename === 'SKILL.md')?.content ?? ''
    const complianceBody =
      compliance.files.find((file) => file.filename === 'SKILL.md')?.content ?? ''
    const sharedBody = verify.files.find((file) => file.filename === 'shared.md')?.content ?? ''

    expect(verifyBody).toContain('specd changes verification start <name>')
    expect(verifyBody).toContain('specd changes verification complete <name>')
    expect(verifyBody).toContain('--delegated --attempt <attemptId>')
    expect(complianceBody).toContain('mode = delegated')
    expect(complianceBody).toContain('do not claim successful verification')
    const standalone = decisionRow(complianceBody, '`change`')
    const delegated = decisionRow(complianceBody, '`delegated`')
    expect(delegated.slice(0, 7)).toEqual(standalone.slice(0, 7))
    expect(standalone.slice(7)).toEqual(['yes', 'yes'])
    expect(delegated.slice(7)).toEqual(['no', 'no'])
    expect(sharedBody).toContain('Do not calculate fingerprints')
    expect(sharedBody).toContain('Verification staleness alone never moves lifecycle state')
  })

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

  it('given the fast-track template directory, when discovered and rendered, then emits a skill and shared context separately', async () => {
    const repository = createSkillRepository()

    const skill = await repository.get('specd-fasttrack')
    const bundle = await repository.getBundle('specd-fasttrack', {
      variables: { sharedFolder: '.specd/config/skills/shared' },
      capabilities: ['frontmatter'],
    })

    expect(skill?.kind).toBe('skill')
    expect(skill?.metadata).toMatchObject({
      supportedCapabilities: ['mcp', 'agents', 'frontmatter'],
      requiredCapabilities: [],
      requiredSharedTemplates: ['shared.md'],
    })
    expect(bundle.files.find((file) => file.filename === 'SKILL.md')?.content).toContain(
      '@.specd/config/skills/shared/shared.md',
    )
    expect(bundle.files.find((file) => file.filename === 'shared.md')?.shared).toBe(true)
  })

  it('given standard-only capabilities, when fast-track is rendered, then capability-specific guidance is omitted', async () => {
    const repository = createSkillRepository()
    const bundle = await repository.getBundle('specd-fasttrack', {
      capabilities: ['frontmatter'],
    })
    const content = bundle.files.find((file) => file.filename === 'SKILL.md')?.content

    expect(content).toContain('Mandatory live journal rule')
    expect(content).not.toContain('When an MCP-backed project workflow')
    expect(content).not.toContain('When independent work can be safely parallelized')
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

import { describe, it, expect, vi } from 'vitest'
import { RecordSkillInstall } from '../../../src/application/use-cases/record-skill-install.js'
import { type ConfigWriter } from '../../../src/application/ports/config-writer.js'

/** Creates a stub ConfigWriter with spied methods. */
function makeConfigWriter(overrides: Partial<ConfigWriter> = {}) {
  const recordSkillInstall = vi.fn().mockResolvedValue(undefined)
  const writer: ConfigWriter = {
    initProject: vi.fn().mockResolvedValue({
      configPath: '/repo/specd.yaml',
      schemaRef: '@specd/schema-std',
      workspaces: ['default'],
    }),
    recordSkillInstall,
    readSkillsManifest: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
  return { writer, recordSkillInstall }
}

describe('RecordSkillInstall', () => {
  it('delegates to config writer recordSkillInstall', async () => {
    const { writer, recordSkillInstall } = makeConfigWriter()
    const uc = new RecordSkillInstall(writer)

    await uc.execute({
      configPath: '/repo/specd.yaml',
      agent: 'claude',
      skillNames: ['review', 'commit'],
    })

    expect(recordSkillInstall).toHaveBeenCalledOnce()
  })

  it('passes all input fields correctly', async () => {
    const { writer, recordSkillInstall } = makeConfigWriter()
    const uc = new RecordSkillInstall(writer)

    await uc.execute({
      configPath: '/repo/specd.yaml',
      agent: 'claude',
      skillNames: ['review', 'commit'],
    })

    expect(recordSkillInstall).toHaveBeenCalledWith('/repo/specd.yaml', 'claude', [
      'review',
      'commit',
    ])
  })

  it('returns void on success', async () => {
    const { writer } = makeConfigWriter()
    const uc = new RecordSkillInstall(writer)

    const result = await uc.execute({
      configPath: '/repo/specd.yaml',
      agent: 'copilot',
      skillNames: ['lint'],
    })

    expect(result).toBeUndefined()
  })
})

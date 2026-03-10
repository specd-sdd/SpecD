import { describe, it, expect, vi } from 'vitest'
import { GetSkillsManifest } from '../../../src/application/use-cases/get-skills-manifest.js'
import { type ConfigWriter } from '../../../src/application/ports/config-writer.js'

/** Creates a stub ConfigWriter with spied methods. */
function makeConfigWriter(overrides: Partial<ConfigWriter> = {}) {
  const readSkillsManifest = vi.fn().mockResolvedValue({})
  const writer: ConfigWriter = {
    initProject: vi.fn().mockResolvedValue({
      configPath: '/repo/specd.yaml',
      schemaRef: '@specd/schema-std',
      workspaces: ['default'],
    }),
    recordSkillInstall: vi.fn().mockResolvedValue(undefined),
    readSkillsManifest,
    ...overrides,
  }
  return { writer, readSkillsManifest }
}

describe('GetSkillsManifest', () => {
  it('returns the manifest from config writer', async () => {
    const manifest = { claude: ['review', 'commit'], copilot: ['lint'] }
    const readFn = vi.fn().mockResolvedValue(manifest)
    const { writer } = makeConfigWriter({ readSkillsManifest: readFn })
    const uc = new GetSkillsManifest(writer)

    const result = await uc.execute({ configPath: '/repo/specd.yaml' })

    expect(result).toEqual(manifest)
  })

  it('passes configPath to the config writer', async () => {
    const { writer, readSkillsManifest } = makeConfigWriter()
    const uc = new GetSkillsManifest(writer)

    await uc.execute({ configPath: '/custom/path/specd.yaml' })

    expect(readSkillsManifest).toHaveBeenCalledWith('/custom/path/specd.yaml')
  })

  it('returns empty object when no skills are installed', async () => {
    const { writer } = makeConfigWriter()
    const uc = new GetSkillsManifest(writer)

    const result = await uc.execute({ configPath: '/repo/specd.yaml' })

    expect(result).toEqual({})
  })
})

import { describe, it, expect, vi } from 'vitest'
import { InitProject } from '../../../src/application/use-cases/init-project.js'
import { type ConfigWriter } from '../../../src/application/ports/config-writer.js'

/** Creates a stub ConfigWriter with spied methods. */
function makeConfigWriter(overrides: Partial<ConfigWriter> = {}) {
  const initProject = vi.fn().mockResolvedValue({
    configPath: '/repo/specd.yaml',
    schemaRef: '@specd/schema-std',
    workspaces: ['default'],
  })
  const writer: ConfigWriter = {
    initProject,
    recordSkillInstall: vi.fn().mockResolvedValue(undefined),
    readSkillsManifest: vi.fn().mockResolvedValue({}),
    ...overrides,
  }
  return { writer, initProject }
}

describe('InitProject', () => {
  it('delegates to config writer initProject', async () => {
    const { writer, initProject } = makeConfigWriter()
    const uc = new InitProject(writer)

    await uc.execute({
      projectRoot: '/repo',
      schemaRef: '@specd/schema-std',
      workspaceId: 'default',
      specsPath: 'specs/',
    })

    expect(initProject).toHaveBeenCalledOnce()
    expect(initProject).toHaveBeenCalledWith({
      projectRoot: '/repo',
      schemaRef: '@specd/schema-std',
      workspaceId: 'default',
      specsPath: 'specs/',
    })
  })

  it('returns the result from config writer', async () => {
    const expected = {
      configPath: '/repo/specd.yaml',
      schemaRef: '@specd/schema-std',
      workspaces: ['default'],
    }
    const initProjectFn = vi.fn().mockResolvedValue(expected)
    const { writer } = makeConfigWriter({ initProject: initProjectFn })
    const uc = new InitProject(writer)

    const result = await uc.execute({
      projectRoot: '/repo',
      schemaRef: '@specd/schema-std',
      workspaceId: 'default',
      specsPath: 'specs/',
    })

    expect(result).toEqual(expected)
  })

  it('passes the force option through to config writer', async () => {
    const { writer, initProject } = makeConfigWriter()
    const uc = new InitProject(writer)

    await uc.execute({
      projectRoot: '/repo',
      schemaRef: '@specd/schema-std',
      workspaceId: 'default',
      specsPath: 'specs/',
      force: true,
    })

    expect(initProject).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })
})

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeRealProject } from '../helpers/real-project.js'
import { captureStderr, captureStdout, makeProgram, mockProcessExit } from './helpers.js'
import { registerProjectUpdate } from '../../src/commands/project/update.js'

const tempDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('project update with real config discovery', () => {
  it('exits 1 with a config error when discovery from the working directory finds no specd.yaml', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'specd-update-noconfig-'))
    tempDirs.push(dir)
    captureStdout()
    const stderr = captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerProjectUpdate(program.command('project'))
    const previousCwd = process.cwd()
    process.chdir(dir)
    try {
      await expect(
        program.parseAsync(['node', 'specd', 'project', 'update']),
      ).rejects.toMatchObject({ code: 1 })
    } finally {
      process.chdir(previousCwd)
    }
    expect(stderr()).toContain('error:')
    expect(stderr().toLowerCase()).toMatch(/specd\.yaml|config/)
    expect(process.exit).toHaveBeenCalledWith(1)
  })

  it('reports an up-to-date project through the real config loader when no plugins are declared', async () => {
    const configPath = await writeRealProject(tempDirs)
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()
    const program = makeProgram()
    registerProjectUpdate(program.command('project'))

    await program.parseAsync([
      'node',
      'specd',
      'project',
      'update',
      '--config',
      configPath,
      '--format',
      'json',
    ])

    expect(JSON.parse(stdout())).toEqual({ plugins: [], hasErrors: false })
  })
})

import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureStderr, captureStdout, makeProgram, mockProcessExit } from './helpers.js'
import { registerConfigShow } from '../../src/commands/config/show.js'

afterEach(() => vi.restoreAllMocks())

/**
 * Writes a project whose only plugin names a package that cannot be resolved.
 *
 * @returns Absolute path to the written `specd.yaml`
 */
async function writeBrokenPluginProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'specd-config-show-'))
  await mkdir(join(dir, 'specs'), { recursive: true })
  const configPath = join(dir, 'specd.yaml')
  await writeFile(
    configPath,
    [
      "schema: '@specd/schema-std'",
      'configVersion: 2',
      'workspaces:',
      '  default:',
      '    specs:',
      '      adapter: fs',
      '      fs:',
      '        path: specs/',
      'plugins:',
      "  - name: '@acme/this-package-does-not-exist'",
      '    contributions: [audit]',
      '',
    ].join('\n'),
    'utf8',
  )
  return configPath
}

describe('config show with the real config loader', () => {
  it('prints the config and does not load a plugin whose package cannot be resolved', async () => {
    const configPath = await writeBrokenPluginProject()
    const stdout = captureStdout()
    const stderr = captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync(['node', 'specd', 'config', 'show', '--config', configPath])

    expect(stderr()).not.toMatch(/error:/)
    expect(stdout()).toContain('@acme/this-package-does-not-exist  (present)')
    expect(stdout()).toContain('[contributions: audit]')
  })

  it('serializes plugins as the flat list in JSON output', async () => {
    const configPath = await writeBrokenPluginProject()
    const stdout = captureStdout()
    captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await program.parseAsync([
      'node',
      'specd',
      'config',
      'show',
      '--config',
      configPath,
      '--format',
      'json',
    ])

    const parsed = JSON.parse(stdout())
    expect(Array.isArray(parsed.plugins)).toBe(true)
    expect(parsed.plugins).toEqual([
      { name: '@acme/this-package-does-not-exist', contributions: ['audit'] },
    ])
  })
})

describe('config show without a usable configuration (real loader)', () => {
  it('exits 1 with an error when no specd.yaml exists from the working directory upwards', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'specd-config-show-empty-'))
    vi.spyOn(process, 'cwd').mockReturnValue(dir)
    const stdout = captureStdout()
    const stderr = captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await expect(program.parseAsync(['node', 'specd', 'config', 'show'])).rejects.toMatchObject({
      code: 1,
    })

    expect(process.exit).toHaveBeenCalledWith(1)
    expect(stderr()).toMatch(/^error: .*specd\.yaml/m)
    expect(stdout()).toBe('')
  })

  it('exits 1 with an error when --config points at a missing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'specd-config-show-missing-'))
    const stdout = captureStdout()
    const stderr = captureStderr()
    mockProcessExit()

    const program = makeProgram()
    registerConfigShow(program.command('config'))
    await expect(
      program.parseAsync(['node', 'specd', 'config', 'show', '--config', join(dir, 'specd.yaml')]),
    ).rejects.toMatchObject({ code: 1 })

    expect(stderr()).toContain('error:')
    expect(stderr()).toContain(join(dir, 'specd.yaml'))
    expect(stdout()).toBe('')
  })
})

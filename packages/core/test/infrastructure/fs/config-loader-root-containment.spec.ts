import { describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  files: new Map<string, string>(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: async (filePath: string) => {
      const content = fixture.files.get(String(filePath).replaceAll('\\', '/'))
      if (content === undefined) {
        const error = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException
        error.code = 'ENOENT'
        throw error
      }
      return content
    },
  },
}))

vi.mock('node:path', async () => {
  const actual = await vi.importActual<typeof import('node:path')>('node:path')
  const driveOrBackslash = (value: string): boolean =>
    /^[A-Za-z]:/.test(value) || value.includes('\\')
  const resolve = (...parts: string[]): string =>
    parts.some(driveOrBackslash) ? actual.win32.resolve(...parts) : actual.resolve(...parts)
  const dirname = (value: string): string =>
    driveOrBackslash(value) ? actual.win32.dirname(value) : actual.dirname(value)
  const join = (...parts: string[]): string =>
    parts.some(driveOrBackslash) ? actual.win32.join(...parts) : actual.join(...parts)
  const isAbsolute = (value: string): boolean =>
    driveOrBackslash(value) ? actual.win32.isAbsolute(value) : actual.isAbsolute(value)
  return {
    ...actual,
    resolve,
    dirname,
    join,
    isAbsolute,
    default: { ...actual, resolve, dirname, join, isAbsolute },
  }
})

import { FsConfigLoader } from '../../../src/infrastructure/fs/config-loader.js'
import { ConfigValidationError } from '../../../src/domain/errors/config-validation-error.js'

const yaml = `
schema: "@specd/schema-std"
workspaces:
  default:
    specs:
      adapter: fs
      fs:
        path: specs
storage:
  changes:
    adapter: fs
    fs:
      path: .specd/changes
  drafts:
    adapter: fs
    fs:
      path: .specd/drafts
  discarded:
    adapter: fs
    fs:
      path: .specd/discarded
  archive:
    adapter: fs
    fs:
      path: .specd/archive
`.trim()

describe('FsConfigLoader config file containment', () => {
  it('rejects a config file outside the repository root', async () => {
    fixture.files.set('C:/other/specd.yaml', yaml)
    const loader = new FsConfigLoader('C:/repo', { configPath: 'C:/other/specd.yaml' })

    await expect(loader.load()).rejects.toBeInstanceOf(ConfigValidationError)
    await expect(loader.load()).rejects.toThrow(/config file resolves outside VCS root/)
  })

  it('loads a config file inside the root when separators differ', async () => {
    fixture.files.set('C:/repo/specd.yaml', yaml)
    const loader = new FsConfigLoader('C:\\repo', { configPath: 'C:/repo/specd.yaml' })

    const config = await loader.load()

    expect(config.workspaces[0]?.name).toBe('default')
  })
})

import { lstat, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addSharedOwner,
  removeSharedFolderIfEmpty,
  removeSharedOwner,
} from '../../src/application/shared-folder-owners.js'

describe('shared-folder-owners', () => {
  let tempDir: string
  let sharedDir: string

  beforeEach(async () => {
    tempDir = path.join(
      os.tmpdir(),
      `specd-shared-owners-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    sharedDir = path.join(tempDir, 'shared')
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  describe('addSharedOwner', () => {
    it('given copilot then claude register, when the marker is read, then owners are sorted and deduplicated', async () => {
      await addSharedOwner(sharedDir, 'copilot')
      await addSharedOwner(sharedDir, 'claude')
      await addSharedOwner(sharedDir, 'claude')

      const owners = await readOwners(sharedDir)
      expect(owners).toEqual(['claude', 'copilot'])
    })

    it('given the shared folder does not exist, when claude registers, then the folder and marker are created', async () => {
      await addSharedOwner(sharedDir, 'claude')

      const folder = await stat(sharedDir)
      expect(folder.isDirectory()).toBe(true)
      expect(await readOwners(sharedDir)).toEqual(['claude'])
    })

    it('given claude is already an owner, when claude registers again, then the marker is byte-identical', async () => {
      await addSharedOwner(sharedDir, 'claude')
      const before = await readFile(markerPath(sharedDir), 'utf8')

      await addSharedOwner(sharedDir, 'claude')

      const after = await readFile(markerPath(sharedDir), 'utf8')
      expect(after).toBe(before)
    })

    it('given the marker is invalid JSON, when copilot registers, then the marker contains only copilot', async () => {
      await mkdir(sharedDir, { recursive: true })
      await writeFile(markerPath(sharedDir), '{', 'utf8')

      await addSharedOwner(sharedDir, 'copilot')

      expect(await readOwners(sharedDir)).toEqual(['copilot'])
    })
  })

  describe('markers with duplicate or unsorted owners', () => {
    it('given a marker with duplicates, when another owner registers, then it is rewritten sorted without duplicates', async () => {
      await writeMarker(sharedDir, ['codex', 'claude', 'codex'])

      await addSharedOwner(sharedDir, 'copilot')

      expect(await readOwners(sharedDir)).toEqual(['claude', 'codex', 'copilot'])
    })

    it('given a marker with duplicates of the registering id, when it registers, then the marker is rewritten without duplicates', async () => {
      await writeMarker(sharedDir, ['claude', 'claude'])

      await addSharedOwner(sharedDir, 'claude')

      expect(await readOwners(sharedDir)).toEqual(['claude'])
    })

    it('given an unsorted marker with unique owners that already holds the id, when it registers, then the marker is rewritten sorted', async () => {
      await writeMarker(sharedDir, ['codex', 'claude'])

      await addSharedOwner(sharedDir, 'claude')

      expect(await readOwners(sharedDir)).toEqual(['claude', 'codex'])
    })

    it('given a marker with duplicates, when a non-owner is released, then the result is deduplicated and the file is untouched', async () => {
      await writeMarker(sharedDir, ['codex', 'claude', 'codex'])
      const before = await readFile(markerPath(sharedDir), 'utf8')

      const result = await removeSharedOwner(sharedDir, 'copilot')

      expect(result).toEqual({ remaining: ['claude', 'codex'], hadMarker: true })
      expect(await readFile(markerPath(sharedDir), 'utf8')).toBe(before)
    })

    it('given a marker with duplicates, when one owner is released, then the marker is written without duplicates', async () => {
      await writeMarker(sharedDir, ['codex', 'claude', 'codex'])

      const result = await removeSharedOwner(sharedDir, 'claude')

      expect(result).toEqual({ remaining: ['codex'], hadMarker: true })
      expect(await readOwners(sharedDir)).toEqual(['codex'])
    })
  })

  describe('markers with a wrong shape', () => {
    it.each([
      ['a string owners value', '{"owners":"x"}'],
      ['a top-level array', '["claude"]'],
      ['non-string owner entries', '{"owners":["claude",1]}'],
      ['a missing owners key', '{}'],
      ['null', 'null'],
    ])(
      'given %s, when removeSharedOwner runs, then it is treated as no marker',
      async (_name, raw) => {
        await mkdir(sharedDir, { recursive: true })
        await writeFile(markerPath(sharedDir), raw, 'utf8')

        const result = await removeSharedOwner(sharedDir, 'claude')

        expect(result).toEqual({ remaining: [], hadMarker: false })
        expect(await readFile(markerPath(sharedDir), 'utf8')).toBe(raw)
      },
    )

    it('given a wrong-shape marker, when claude registers, then the marker is replaced with only claude', async () => {
      await mkdir(sharedDir, { recursive: true })
      await writeFile(markerPath(sharedDir), '{"owners":"x"}', 'utf8')

      await addSharedOwner(sharedDir, 'claude')

      expect(await readOwners(sharedDir)).toEqual(['claude'])
    })
  })

  describe('removeSharedOwner', () => {
    it('given invalid JSON, when removeSharedOwner runs, then it returns no marker and leaves the file unchanged', async () => {
      await mkdir(sharedDir, { recursive: true })
      await writeFile(markerPath(sharedDir), '{', 'utf8')

      const result = await removeSharedOwner(sharedDir, 'claude')

      expect(result).toEqual({ remaining: [], hadMarker: false })
      expect(await readFile(markerPath(sharedDir), 'utf8')).toBe('{')
    })

    it('given claude and copilot, when claude is released, then only copilot remains', async () => {
      await addSharedOwner(sharedDir, 'claude')
      await addSharedOwner(sharedDir, 'copilot')

      const result = await removeSharedOwner(sharedDir, 'claude')

      expect(result).toEqual({ remaining: ['copilot'], hadMarker: true })
      expect(await readOwners(sharedDir)).toEqual(['copilot'])
    })

    it('given only claude, when claude is released, then the marker is deleted', async () => {
      await addSharedOwner(sharedDir, 'claude')

      const result = await removeSharedOwner(sharedDir, 'claude')

      expect(result).toEqual({ remaining: [], hadMarker: true })
      await expect(stat(markerPath(sharedDir))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('given shared.md and no marker, when claude is released, then nothing is created or changed', async () => {
      await mkdir(sharedDir, { recursive: true })
      const sharedFile = path.join(sharedDir, 'shared.md')
      await writeFile(sharedFile, 'keep', 'utf8')
      const before = await readFile(sharedFile, 'utf8')

      const result = await removeSharedOwner(sharedDir, 'claude')

      expect(result).toEqual({ remaining: [], hadMarker: false })
      expect(await readFile(sharedFile, 'utf8')).toBe(before)
      await expect(stat(markerPath(sharedDir))).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('given only claude, when codex is released, then the marker still lists claude', async () => {
      await addSharedOwner(sharedDir, 'claude')
      const before = await readFile(markerPath(sharedDir), 'utf8')

      const result = await removeSharedOwner(sharedDir, 'codex')

      expect(result).toEqual({ remaining: ['claude'], hadMarker: true })
      expect(await readFile(markerPath(sharedDir), 'utf8')).toBe(before)
    })
  })

  describe('removeSharedFolderIfEmpty', () => {
    it('given an empty shared folder, when removal runs, then the folder no longer exists', async () => {
      await mkdir(sharedDir, { recursive: true })

      await removeSharedFolderIfEmpty(sharedDir)

      await expect(stat(sharedDir)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('given a foreign file, when removal runs, then the file remains', async () => {
      await mkdir(sharedDir, { recursive: true })
      const notes = path.join(sharedDir, 'notes.txt')
      await writeFile(notes, 'user', 'utf8')

      await expect(removeSharedFolderIfEmpty(sharedDir)).resolves.toBeUndefined()

      expect(await readFile(notes, 'utf8')).toBe('user')
    })

    it('given the folder does not exist, when removal runs, then it resolves', async () => {
      await expect(removeSharedFolderIfEmpty(sharedDir)).resolves.toBeUndefined()
    })
  })

  describe('symlinked marker', () => {
    it('given .owners.json is a symlink, when claude registers, then a regular file replaces it and the target is untouched', async () => {
      const outside = path.join(tempDir, 'outside.json')
      await writeFile(outside, '{"owners":["victim"]}', 'utf8')
      await mkdir(sharedDir, { recursive: true })
      await symlink(outside, markerPath(sharedDir))

      await addSharedOwner(sharedDir, 'claude')

      expect((await lstat(markerPath(sharedDir))).isSymbolicLink()).toBe(false)
      expect(await readOwners(sharedDir)).toEqual(['claude'])
      expect(await readFile(outside, 'utf8')).toBe('{"owners":["victim"]}')
    })

    it('given .owners.json is a symlink to a valid marker, when claude is released, then hadMarker is false and nothing is touched', async () => {
      const outside = path.join(tempDir, 'outside.json')
      await writeFile(outside, '{"owners":["claude"]}', 'utf8')
      await mkdir(sharedDir, { recursive: true })
      await symlink(outside, markerPath(sharedDir))

      const release = await removeSharedOwner(sharedDir, 'claude')

      expect(release).toEqual({ remaining: [], hadMarker: false })
      expect((await lstat(markerPath(sharedDir))).isSymbolicLink()).toBe(true)
      expect(await readFile(outside, 'utf8')).toBe('{"owners":["claude"]}')
    })
  })

  describe('dangling symlinked marker', () => {
    it('given .owners.json is a dangling symlink, when claude registers, then a regular file replaces it and the target is not created', async () => {
      const outside = path.join(tempDir, 'missing.json')
      await mkdir(sharedDir, { recursive: true })
      await symlink(outside, markerPath(sharedDir))

      await addSharedOwner(sharedDir, 'claude')

      expect((await lstat(markerPath(sharedDir))).isSymbolicLink()).toBe(false)
      expect(await readOwners(sharedDir)).toEqual(['claude'])
      await expect(lstat(outside)).rejects.toMatchObject({ code: 'ENOENT' })
    })

    it('given .owners.json is a dangling symlink, when claude is released, then hadMarker is false', async () => {
      const outside = path.join(tempDir, 'missing.json')
      await mkdir(sharedDir, { recursive: true })
      await symlink(outside, markerPath(sharedDir))

      const release = await removeSharedOwner(sharedDir, 'claude')

      expect(release).toEqual({ remaining: [], hadMarker: false })
      await expect(lstat(outside)).rejects.toMatchObject({ code: 'ENOENT' })
    })
  })

  describe('removeSharedFolderIfEmpty with a non-directory', () => {
    it('given the shared folder is a symlink to a file, when removal runs, then it does not throw and leaves it', async () => {
      const target = path.join(tempDir, 'file.txt')
      await writeFile(target, 'x', 'utf8')
      await symlink(target, sharedDir)

      await expect(removeSharedFolderIfEmpty(sharedDir)).resolves.toBeUndefined()
      expect(await readFile(target, 'utf8')).toBe('x')
    })
  })
})

function markerPath(sharedDir: string): string {
  return path.join(sharedDir, '.owners.json')
}

async function readOwners(sharedDir: string): Promise<unknown> {
  const parsed = JSON.parse(await readFile(markerPath(sharedDir), 'utf8')) as { owners: unknown }
  return parsed.owners
}

async function writeMarker(sharedDir: string, owners: string[]): Promise<void> {
  await mkdir(sharedDir, { recursive: true })
  await writeFile(markerPath(sharedDir), JSON.stringify({ owners }), 'utf8')
}

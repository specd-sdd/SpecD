import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ensureTmpGitignore } from '../../../src/infrastructure/fs/ensure-tmp-gitignore.js'

describe('ensureTmpGitignore', () => {
  const roots: string[] = []

  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
  })

  it('treats CRLF canonical content as already installed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specd-gitignore-'))
    roots.push(root)
    const gitignore = path.join(root, 'tmp', '.gitignore')
    await mkdir(path.dirname(gitignore), { recursive: true })
    await writeFile(gitignore, '*\r\n!.gitignore\r\n', 'utf8')

    await ensureTmpGitignore(root)

    expect(await readFile(gitignore, 'utf8')).toBe('*\r\n!.gitignore\r\n')
  })
})

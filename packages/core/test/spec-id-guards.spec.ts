import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseSpecLock } from '../src/domain/services/parse-spec-lock.js'
import { InvalidSpecLockError } from '../src/domain/errors/invalid-spec-lock-error.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const coreSrcRoot = join(dirname(fileURLToPath(import.meta.url)), '../src')
const specsRoot = join(repoRoot, 'specs')

const WORKSPACE_RE_LITERAL = '/^[a-z][a-z0-9-]+$/'
const SEGMENT_RE_LITERAL = '/^[a-z0-9_][a-z0-9_-]*$/'

async function collectFiles(dir: string, predicate: (name: string) => boolean): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectFiles(full, predicate)))
    } else if (predicate(entry.name)) {
      out.push(full)
    }
  }
  return out
}

describe('spec-id guards', () => {
  it('parses every specs/**/spec-lock.json without InvalidSpecLockError', async () => {
    const locks = await collectFiles(specsRoot, (name) => name === 'spec-lock.json')
    expect(locks.length).toBeGreaterThan(0)

    const failures: string[] = []
    for (const lockPath of locks) {
      const raw = await readFile(lockPath, 'utf-8')
      const rel = relative(repoRoot, lockPath)
      try {
        parseSpecLock(raw, { specId: rel, location: rel })
      } catch (err) {
        if (err instanceof InvalidSpecLockError) {
          failures.push(`${rel}: ${err.message}`)
        } else {
          throw err
        }
      }
    }

    expect(failures).toEqual([])
  })

  it('keeps workspace and segment regex literals only in spec-id-rules.ts', async () => {
    const files = await collectFiles(coreSrcRoot, (name) => name.endsWith('.ts'))
    const offenders: string[] = []

    for (const file of files) {
      const rel = relative(coreSrcRoot, file)
      if (rel === join('domain', 'services', 'spec-id-rules.ts')) continue
      const source = await readFile(file, 'utf-8')
      if (source.includes(WORKSPACE_RE_LITERAL) || source.includes(SEGMENT_RE_LITERAL)) {
        offenders.push(rel)
      }
    }

    expect(offenders).toEqual([])
  })
})

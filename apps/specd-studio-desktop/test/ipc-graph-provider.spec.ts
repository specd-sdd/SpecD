import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(testDir, '..')

describe('desktop graph provider wiring', () => {
  it('imports the Electron graph package for local graph operations', () => {
    const source = readFileSync(path.join(desktopRoot, 'src/main/ipc-handlers.ts'), 'utf8')

    expect(source).toContain("from '@specd/code-graph-electron'")
    expect(source).not.toContain('../../../../packages/code-graph/dist/index.js')
  })
})

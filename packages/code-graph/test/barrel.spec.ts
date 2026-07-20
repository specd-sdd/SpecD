import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CODE_GRAPH_VERSION, type CodeGraphProvider } from '../src/public.js'
import { InMemoryIndexSession } from '../src/index.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('@specd/code-graph barrel', () => {
  it('exports CODE_GRAPH_VERSION matching package.json', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version: string
    }
    expect(CODE_GRAPH_VERSION).toBe(packageJson.version)
    expect(CODE_GRAPH_VERSION).not.toBe('0.0.0')
  })

  it('keeps InMemoryIndexSession on the internal barrel only', async () => {
    const publicModule = await import('../src/public.js')
    expect('InMemoryIndexSession' in publicModule).toBe(false)
    expect(InMemoryIndexSession).toBeDefined()
  })

  it('exposes CodeGraphProvider as a type-only factory result', async () => {
    const publicModule = await import('../src/public.js')
    const provider: CodeGraphProvider | undefined = undefined

    expect(provider).toBeUndefined()
    expect('CodeGraphProvider' in publicModule).toBe(false)
  })
})

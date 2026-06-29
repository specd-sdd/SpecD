import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CODE_GRAPH_VERSION } from '../src/index.js'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('@specd/code-graph barrel', () => {
  it('exports CODE_GRAPH_VERSION matching package.json', () => {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
      version: string
    }
    expect(CODE_GRAPH_VERSION).toBe(packageJson.version)
    expect(CODE_GRAPH_VERSION).not.toBe('0.0.0')
  })
})

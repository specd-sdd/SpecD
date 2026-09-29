import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { NodeResolutionManifestSource } from '../../../src/infrastructure/fs/node-resolution-manifest-source.js'

describe('NodeResolutionManifestSource', () => {
  let root = ''

  afterEach(() => {
    if (root !== '') rmSync(root, { recursive: true, force: true })
  })

  it('given a manifest file, when the node source reads it, then the text is returned', () => {
    root = mkdtempSync(join(tmpdir(), 'specd-manifest-source-'))
    const file = join(root, 'package.json')
    writeFileSync(file, '{"name":"demo"}\n')
    const source = new NodeResolutionManifestSource()
    expect(source.directoryExists(root)).toBe(true)
    expect(source.isRegularFile(file)).toBe(true)
    expect(source.readText(file)).toBe('{"name":"demo"}\n')
  })

  it('given a directory named package.json, when checked, then it is not a regular file', () => {
    root = mkdtempSync(join(tmpdir(), 'specd-manifest-source-'))
    const dir = join(root, 'package.json')
    mkdirSync(dir)
    const source = new NodeResolutionManifestSource()
    expect(source.isRegularFile(dir)).toBe(false)
    expect(source.readText(join(root, 'missing.json'))).toBeUndefined()
  })
})

import { describe, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { LadybugGraphStore } from '../../../src/infrastructure/ladybug/ladybug-graph-store.js'
import { graphStoreContractTests } from '../../domain/ports/graph-store.contract.js'

let tempDir: string

graphStoreContractTests(
  'LadybugGraphStore',
  () => {
    tempDir = mkdtempSync(join(tmpdir(), 'code-graph-test-'))
    return new LadybugGraphStore(tempDir)
  },
  async () => {
    rmSync(tempDir, { recursive: true, force: true })
  },
)

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEphemeralChange, discardEphemeralChange } from './helpers/ephemeral-change.js'
import { apiJson, expectProblem } from './helpers/http-client.js'
import { loadProjectSamples } from './helpers/project-samples.js'
import { findRepoRoot } from './helpers/repo-root.js'

/** Reads a change-directory artifact from disk (nested paths are not single-segment HTTP routes). */
function readChangeArtifactFromDisk(changeName: string, filename: string): string | null {
  const root = findRepoRoot()
  for (const base of ['.specd/changes', 'specd-sdd/changes'] as const) {
    const changesDir = path.join(root, base)
    if (!fs.existsSync(changesDir)) {
      continue
    }
    for (const entry of fs.readdirSync(changesDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith(`-${changeName}`)) {
        continue
      }
      const filePath = path.join(changesDir, entry.name, filename)
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8')
      }
    }
  }
  return null
}

describe('Changes API', () => {
  describe('collections', () => {
    it('given api server, when GET /changes, then returns active changes', async () => {
      const { res, data } = await apiJson<Array<{ name: string }>>('/changes')
      expect(res.ok).toBe(true)
      expect(Array.isArray(data)).toBe(true)
    })

    it('given api server, when GET /drafts, then returns drafts', async () => {
      const { res, data } = await apiJson<unknown[]>('/drafts')
      expect(res.ok).toBe(true)
      expect(Array.isArray(data)).toBe(true)
    })

    it('given api server, when GET /discarded, then returns discarded changes', async () => {
      const { res, data } = await apiJson<unknown[]>('/discarded')
      expect(res.ok).toBe(true)
      expect(Array.isArray(data)).toBe(true)
    })

    it('given api server, when GET /archived-changes, then returns archive index entries', async () => {
      const { res, data } = await apiJson<{ items: Array<{ name: string }>; meta: { total: number } }>(
        '/archived-changes',
      )
      expect(res.ok).toBe(true)
      expect(Array.isArray(data.items)).toBe(true)
      expect(typeof data.meta.total).toBe('number')
    })

    it('given api server, when GET /changes/overlaps, then returns overlap map', async () => {
      const { res, data } = await apiJson<unknown>('/changes/overlaps')
      expect(res.ok).toBe(true)
      expect(data).toBeDefined()
    })

    it('given missing name, when POST /changes, then returns problem+json', async () => {
      const body = await expectProblem(
        '/changes',
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        400,
      )
      expect(body.code).toBe('INVALID_REQUEST')
    })
  })

  describe('read', () => {
    it('given an active change, when GET /changes/:name, then returns detail', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const { res, data } = await apiJson<{ name: string; state: string }>(
        `/changes/${encodeURIComponent(activeChangeName)}`,
      )
      expect(res.ok).toBe(true)
      expect(data.name).toBe(activeChangeName)
      expect(data.state.length).toBeGreaterThan(0)
    })

    it('given an active change, when GET /changes/:name/status, then returns status', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const { res, data } = await apiJson<{ name: string }>(
        `/changes/${encodeURIComponent(activeChangeName)}/status`,
      )
      expect(res.ok).toBe(true)
      expect(data.name).toBe(activeChangeName)
    })

    it('given an active change, when GET /changes/:name/artifacts, then lists artifacts', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const { res, data } = await apiJson<{ artifacts: unknown[] }>(
        `/changes/${encodeURIComponent(activeChangeName)}/artifacts`,
      )
      expect(res.ok).toBe(true)
      expect(Array.isArray(data.artifacts)).toBe(true)
    })

    it('given an active change, when GET /changes/:name/context, then returns compiled context', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const { res: detailRes, data: detail } = await apiJson<{ specIds: string[] }>(
        `/changes/${encodeURIComponent(activeChangeName)}`,
      )
      expect(detailRes.ok).toBe(true)
      const { res, data } = await apiJson<{ content: string; fingerprint: string }>(
        `/changes/${encodeURIComponent(activeChangeName)}/context`,
      )
      expect(res.ok).toBe(true)
      expect(typeof data.content).toBe('string')
      expect(typeof data.fingerprint).toBe('string')
      expect(data.content.length).toBeGreaterThan(0)
      const firstSpecId = detail.specIds[0]
      if (firstSpecId !== undefined) {
        expect(data.content).toContain(firstSpecId)
      }
      expect(data.content).toMatch(/## Spec content|## Available context specs/)
    })

    it('given an active change, when GET /changes/:name/implementation-review, then returns review', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const { res } = await apiJson<unknown>(
        `/changes/${encodeURIComponent(activeChangeName)}/implementation-review`,
      )
      expect(res.ok).toBe(true)
    })

    it('given unknown change, when GET /changes/:name, then returns 404', async () => {
      const body = await expectProblem('/changes/__no_such_change__', undefined, 404)
      expect(body.code).toBe('CHANGE_NOT_FOUND')
    })

    it('given missing specId, when GET /changes/:name/preview, then returns problem+json', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const body = await expectProblem(
        `/changes/${encodeURIComponent(activeChangeName)}/preview`,
        undefined,
        400,
      )
      expect(body.code).toBe('INVALID_REQUEST')
    })

    it('given missing specId in body, when POST /changes/:name/preview, then returns problem+json', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const body = await expectProblem(
        `/changes/${encodeURIComponent(activeChangeName)}/preview`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
        400,
      )
      expect(body.code).toBe('INVALID_REQUEST')
    })

    it('given an active change with spec deltas, when POST preview with artifactOverrides, then merged reflects draft', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }

      const draftMarker = '__PREVIEW_DRAFT_API_TEST__'
      const changePath = `/changes/${encodeURIComponent(activeChangeName)}`

      const { data: detail } = await apiJson<{ specIds: string[] }>(changePath)
      const { data: artifactList } = await apiJson<{
        artifacts: Array<{ filename: string }>
      }>(`${changePath}/artifacts`)

      const deltaFilename = artifactList.artifacts.find((a) =>
        a.filename.endsWith('/spec.md.delta.yaml'),
      )?.filename
      if (deltaFilename === undefined) {
        return
      }

      const deltaMatch = /^deltas\/([^/]+)\/(.+)\/spec\.md\.delta\.yaml$/.exec(deltaFilename)
      if (deltaMatch === null) {
        return
      }
      const specId = `${deltaMatch[1]}:${deltaMatch[2]}`
      if (!detail.specIds.includes(specId)) {
        return
      }

      const savedDelta = readChangeArtifactFromDisk(activeChangeName, deltaFilename)
      if (savedDelta === null) {
        return
      }

      const uniquePhrase = '`updatedAt >= createdAt`'
      if (!savedDelta.includes(uniquePhrase)) {
        return
      }
      const draftOverride = savedDelta.replace(uniquePhrase, `${draftMarker} and ${uniquePhrase}`)

      const { data: baseline } = await apiJson<{
        specId: string
        files: Array<{ filename: string; merged?: string }>
      }>(`${changePath}/preview?specId=${encodeURIComponent(specId)}`)
      const baseMerged = baseline.files.find((f) => f.filename === 'spec.md')?.merged ?? ''

      const { res, data } = await apiJson<{
        specId: string
        files: Array<{ filename: string; merged?: string }>
      }>(`${changePath}/preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          specId,
          artifactOverrides: { [deltaFilename]: draftOverride },
        }),
      })

      expect(res.ok).toBe(true)
      expect(data.specId).toBe(specId)
      const draftMerged = data.files.find((f) => f.filename === 'spec.md')?.merged ?? ''
      expect(draftMerged).toContain(draftMarker)
      expect(baseMerged).not.toContain(draftMarker)
    })
  })

  describe('archived', () => {
    it('given an archived change, when GET /archived-changes/:name, then returns snapshot', async () => {
      const { archivedChangeName } = await loadProjectSamples()
      if (archivedChangeName === null) {
        return
      }
      const { res, data } = await apiJson<{
        name: string
        state: string
        workspaces: string[]
        artifacts: Array<{ filename: string; type: string; state: string }>
      }>(
        `/archived-changes/${encodeURIComponent(archivedChangeName)}`,
      )
      expect(res.ok).toBe(true)
      expect(data.name).toBe(archivedChangeName)
      expect(data.state).toBe('archived')
      expect(Array.isArray(data.workspaces)).toBe(true)
      expect(Array.isArray(data.artifacts)).toBe(true)
      expect(data.artifacts.every((artifact) => artifact.state !== 'missing')).toBe(true)
    })

    it('given an archived change artifact, when GET /archived-changes/:name/artifacts/:filename, then returns content', async () => {
      const { archivedChangeName } = await loadProjectSamples()
      if (archivedChangeName === null) {
        return
      }
      const { data: detail } = await apiJson<{
        artifacts: Array<{ filename: string }>
      }>(`/archived-changes/${encodeURIComponent(archivedChangeName)}`)
      const filename = detail.artifacts[0]?.filename
      if (filename === undefined) {
        return
      }
      const { res, data } = await apiJson<{ content: string }>(
        `/archived-changes/${encodeURIComponent(archivedChangeName)}/artifacts/${encodeURIComponent(filename)}`,
      )
      expect(res.ok).toBe(true)
      expect(typeof data.content).toBe('string')
      expect(data.content.length).toBeGreaterThan(0)
    })
  })

  describe('mutations (validation only)', () => {
    it('given missing content, when PUT /changes/:name/artifacts/:file, then returns problem+json', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const body = await expectProblem(
        `/changes/${encodeURIComponent(activeChangeName)}/artifacts/spec.md`,
        { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' },
        400,
      )
      expect(body.code).toBe('INVALID_REQUEST')
    })

    it('given missing to, when POST /changes/:name/transition, then returns problem+json', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const body = await expectProblem(
        `/changes/${encodeURIComponent(activeChangeName)}/transition`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
        400,
      )
      expect(body.code).toBe('INVALID_REQUEST')
    })

    it('given invalid transition target, when POST /changes/:name/transition, then returns problem+json', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const body = await expectProblem(
        `/changes/${encodeURIComponent(activeChangeName)}/transition`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ to: 'ship-it' }),
        },
        400,
      )
      expect(body.code).toBe('INVALID_REQUEST')
    })

    it('given missing artifactId, when POST /changes/:name/skip-artifact, then returns problem+json', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const body = await expectProblem(
        `/changes/${encodeURIComponent(activeChangeName)}/skip-artifact`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        },
        400,
      )
      expect(body.code).toBe('INVALID_REQUEST')
    })

    it('given add action without specId, when PATCH implementation-tracking, then returns problem+json', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const body = await expectProblem(
        `/changes/${encodeURIComponent(activeChangeName)}/implementation-tracking`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'add',
            file: 'packages/api/src/index.ts',
          }),
        },
        400,
      )
      expect(body.code).toBe('INVALID_REQUEST')
    })

    it('given resolve action, when PATCH implementation-tracking, then returns projection dto', async () => {
      const { activeChangeName } = await loadProjectSamples()
      if (activeChangeName === null) {
        return
      }
      const { res, data } = await apiJson<{
        implementationTracking: {
          trackedFiles: Array<{ file: string; state: string }>
          links: unknown[]
        }
      }>(`/changes/${encodeURIComponent(activeChangeName)}/implementation-tracking`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve',
          file: 'packages/api/src/index.ts',
        }),
      })
      expect(res.ok).toBe(true)
      expect(Array.isArray(data.implementationTracking.trackedFiles)).toBe(true)
      expect(Array.isArray(data.implementationTracking.links)).toBe(true)
    })

    it('given ephemeral change, when POST validate-all, then returns batch DTO', async () => {
      const { workspace, specPath } = await loadProjectSamples()
      const changeName = await createEphemeralChange({
        specIds: [`${workspace}:${specPath}`],
      })
      try {
        const { res, data } = await apiJson<{
          passed: boolean
          total: number
          results: Array<{
            spec: string | null
            artifact: string
            passed: boolean
            failures: unknown[]
            warnings: string[]
            files: string[]
          }>
        }>(`/changes/${encodeURIComponent(changeName)}/validate-all`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
        })
        expect(res.ok).toBe(true)
        expect(typeof data.passed).toBe('boolean')
        expect(typeof data.total).toBe('number')
        expect(data.total).toBeGreaterThan(0)
        expect(Array.isArray(data.results)).toBe(true)
        for (const step of data.results) {
          expect(typeof step.artifact).toBe('string')
          expect(step.spec === null || typeof step.spec === 'string').toBe(true)
          expect(typeof step.passed).toBe('boolean')
          expect(Array.isArray(step.failures)).toBe(true)
          expect(Array.isArray(step.warnings)).toBe(true)
          expect(Array.isArray(step.files)).toBe(true)
        }
      } finally {
        await discardEphemeralChange(changeName)
      }
    })

    it('given ephemeral change, when POST validate-all with artifactId, then filters steps', async () => {
      const { workspace, specPath } = await loadProjectSamples()
      const changeName = await createEphemeralChange({
        specIds: [`${workspace}:${specPath}`],
      })
      try {
        const { res, data } = await apiJson<{
          total: number
          results: Array<{ artifact: string }>
        }>(`/changes/${encodeURIComponent(changeName)}/validate-all`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ artifactId: 'proposal' }),
        })
        expect(res.ok).toBe(true)
        expect(data.total).toBeGreaterThan(0)
        expect(data.results.every((step) => step.artifact === 'proposal')).toBe(true)
      } finally {
        await discardEphemeralChange(changeName)
      }
    })

    it('given ephemeral change, when PATCH description, then persists on GET detail', async () => {
      const changeName = await createEphemeralChange({
        description: 'fixture description before patch',
      })
      try {
        const path = `/changes/${encodeURIComponent(changeName)}`
        const marker = `patched-description-${Date.now()}`
        const { res: patchRes, data: patched } = await apiJson<{ description?: string }>(path, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ description: marker }),
        })
        expect(patchRes.ok).toBe(true)
        expect(patched.description).toBe(marker)

        const { res: getRes, data: loaded } = await apiJson<{ description?: string }>(path)
        expect(getRes.ok).toBe(true)
        expect(loaded.description).toBe(marker)
      } finally {
        await discardEphemeralChange(changeName)
      }
    })
  })
})

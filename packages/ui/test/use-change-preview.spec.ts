import { describe, expect, it } from 'vitest'
import {
  deriveSpecIdFromFilename,
  showsInspectorDiffTab,
  usesSpecPreview,
} from '../src/hooks/use-change-preview.js'

describe('showsInspectorDiffTab', () => {
  it('is true only for delta paths on active-change preview artifacts', () => {
    expect(showsInspectorDiffTab('deltas/core/change-manifest/spec.md.delta.yaml')).toBe(true)
    expect(showsInspectorDiffTab('specs/ui/foo/spec.md')).toBe(false)
    expect(showsInspectorDiffTab('proposal.md')).toBe(false)
    expect(showsInspectorDiffTab(undefined)).toBe(false)
  })
})

describe('usesSpecPreview', () => {
  it('includes specs and deltas under change directory', () => {
    expect(usesSpecPreview('specs/ui/foo/spec.md')).toBe(true)
    expect(usesSpecPreview('deltas/core/foo/spec.md.delta.yaml')).toBe(true)
    expect(deriveSpecIdFromFilename('specs/ui/foo/spec.md')).toBe('ui:foo')
  })
})

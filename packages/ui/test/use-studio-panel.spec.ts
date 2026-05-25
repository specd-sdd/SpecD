import { describe, expect, it } from 'vitest'
import {
  studioOutputLevelFromMessage,
  studioOutputProblems,
} from '../src/hooks/use-studio-panel.js'
import type { StudioOutputEntryDto } from '@specd/client'

function entry(
  id: string,
  message: string,
  level: StudioOutputEntryDto['level'],
): StudioOutputEntryDto {
  return { id, timestamp: '2026-05-25T12:00:00.000Z', level, message }
}

describe('studioOutputLevelFromMessage', () => {
  it('maps validation prefixes to severity', () => {
    expect(studioOutputLevelFromMessage('✗ schema error')).toBe('error')
    expect(studioOutputLevelFromMessage('⚠ drift warning')).toBe('warn')
    expect(studioOutputLevelFromMessage('Validation passed')).toBe('info')
  })
})

describe('studioOutputProblems', () => {
  it('filters warn and error only', () => {
    const rows = [
      entry('1', 'ok', 'info'),
      entry('2', '⚠ warn', 'warn'),
      entry('3', '✗ fail', 'error'),
      entry('4', 'debug', 'debug'),
    ]
    const problems = studioOutputProblems(rows)
    expect(problems.map((p) => p.id)).toEqual(['2', '3'])
  })
})

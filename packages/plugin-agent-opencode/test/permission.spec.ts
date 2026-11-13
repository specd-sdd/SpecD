import { describe, expect, it } from 'vitest'
import { toOpenCodePermission } from '../src/application/use-cases/install-skills.js'

describe('toOpenCodePermission', () => {
  it('given a pattern that contains a comma inside parentheses, when mapped, then the comma does not split the entry', () => {
    expect(toOpenCodePermission('Bash(a, b), Read')).toEqual({
      bash: { 'a, b': 'allow' },
      read: 'allow',
    })
  })

  it('given several patterned entries of one tool, when mapped, then each pattern is kept intact', () => {
    expect(toOpenCodePermission('Bash(node *), Bash(git log, git diff), Bash')).toEqual({
      bash: { '*': 'allow', 'node *': 'allow', 'git log, git diff': 'allow' },
    })
  })

  it('given empty entries and extra whitespace, when mapped, then they are ignored', () => {
    expect(toOpenCodePermission(' Read , , Write,')).toEqual({ read: 'allow', write: 'allow' })
  })
})

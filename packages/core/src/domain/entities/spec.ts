import { SpecPath } from '../value-objects/spec-path.js'

export class Spec {
  readonly path: SpecPath
  readonly content: string

  constructor(path: SpecPath, content: string) {
    this.path = path
    this.content = content
  }

  sections(): Map<string, string> {
    const result = new Map<string, string>()
    const lines = this.content.split('\n')

    let currentHeading: string | null = null
    let currentLines: string[] = []

    for (const line of lines) {
      const match = /^##\s+(.+)$/.exec(line)
      if (match?.[1] !== undefined) {
        if (currentHeading !== null) {
          result.set(currentHeading, currentLines.join('\n').trim())
        }
        currentHeading = match[1].trim()
        currentLines = []
      } else if (currentHeading !== null) {
        currentLines.push(line)
      }
    }

    if (currentHeading !== null) {
      result.set(currentHeading, currentLines.join('\n').trim())
    }

    return result
  }

  section(name: string): string | null {
    return this.sections().get(name) ?? null
  }
}

import { SpecPath } from '../value-objects/spec-path.js'

export interface DeltaProps {
  specPath: SpecPath
  added: readonly string[]
  modified: readonly string[]
  removed: readonly string[]
}

export class Delta {
  readonly specPath: SpecPath
  readonly added: readonly string[]
  readonly modified: readonly string[]
  readonly removed: readonly string[]

  constructor(props: DeltaProps) {
    this.specPath = props.specPath
    this.added = props.added
    this.modified = props.modified
    this.removed = props.removed
  }

  isStructural(): boolean {
    return this.modified.length > 0 || this.removed.length > 0
  }

  isEmpty(): boolean {
    return this.added.length === 0 && this.modified.length === 0 && this.removed.length === 0
  }
}

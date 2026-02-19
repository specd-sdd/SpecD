import { SpecPath } from '../value-objects/spec-path.js'
import { type ApprovalRecord } from './change.js'

export interface ArchivedChangeProps {
  name: string
  archivedName: string
  scope: SpecPath
  archivedAt: Date
  artifacts: readonly string[]
  approval?: ApprovalRecord
}

export class ArchivedChange {
  readonly name: string
  readonly archivedName: string
  readonly scope: SpecPath
  readonly archivedAt: Date
  readonly artifacts: readonly string[]
  readonly approval: ApprovalRecord | undefined

  constructor(props: ArchivedChangeProps) {
    this.name = props.name
    this.archivedName = props.archivedName
    this.scope = props.scope
    this.archivedAt = props.archivedAt
    this.artifacts = props.artifacts
    this.approval = props.approval
  }

  get wasStructural(): boolean {
    return this.approval !== undefined
  }
}

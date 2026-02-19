import { type ChangeState, isValidTransition } from '../value-objects/change-state.js'
import { type ArtifactStatus } from '../value-objects/artifact-status.js'
import { SpecPath } from '../value-objects/spec-path.js'
import { InvalidStateTransitionError } from '../errors/invalid-state-transition-error.js'
import { ApprovalRequiredError } from '../errors/approval-required-error.js'
import { type Artifact } from './artifact.js'

export interface StructuralChange {
  readonly spec: string
  readonly type: 'MODIFIED' | 'REMOVED'
  readonly requirement: string
}

export interface ApprovalRecord {
  readonly reason: string
  readonly approvedBy: string
  readonly approvedAt: Date
  readonly structuralChanges: readonly StructuralChange[]
}

export interface ChangeProps {
  name: string
  scope: SpecPath
  state?: ChangeState
  artifacts?: Map<string, Artifact>
  approval?: ApprovalRecord
  createdAt?: Date
}

export class Change {
  readonly name: string
  readonly scope: SpecPath
  readonly createdAt: Date
  private _state: ChangeState
  private _artifacts: Map<string, Artifact>
  private _approval: ApprovalRecord | undefined

  constructor(props: ChangeProps) {
    this.name = props.name
    this.scope = props.scope
    this.createdAt = props.createdAt ?? new Date()
    this._state = props.state ?? 'drafting'
    this._artifacts = props.artifacts ?? new Map()
    this._approval = props.approval
  }

  get state(): ChangeState {
    return this._state
  }

  get artifacts(): ReadonlyMap<string, Artifact> {
    return this._artifacts
  }

  get approval(): ApprovalRecord | undefined {
    return this._approval
  }

  get isArchivable(): boolean {
    return this._state === 'archivable'
  }

  effectiveStatus(type: string): ArtifactStatus {
    const artifact = this._artifacts.get(type)
    if (!artifact) return 'missing'
    if (artifact.status === 'missing') return 'missing'

    for (const req of artifact.requires) {
      if (this.effectiveStatus(req) !== 'complete') return 'in-progress'
    }

    return artifact.status
  }

  transition(to: ChangeState): void {
    if (!isValidTransition(this._state, to)) {
      throw new InvalidStateTransitionError(this._state, to)
    }
    this._state = to
  }

  approve(reason: string, approvedBy: string, structuralChanges: readonly StructuralChange[]): void {
    if (this._state !== 'pending-approval') {
      throw new InvalidStateTransitionError(this._state, 'approved')
    }
    this._approval = {
      reason,
      approvedBy,
      approvedAt: new Date(),
      structuralChanges,
    }
    this._state = 'approved'
  }

  assertArchivable(): void {
    if (this._state === 'pending-approval') {
      throw new ApprovalRequiredError(this.name)
    }
    if (!this.isArchivable) {
      throw new InvalidStateTransitionError(this._state, 'archivable')
    }
  }

  setArtifact(artifact: Artifact): void {
    this._artifacts.set(artifact.type, artifact)
  }

  getArtifact(type: string): Artifact | null {
    return this._artifacts.get(type) ?? null
  }
}

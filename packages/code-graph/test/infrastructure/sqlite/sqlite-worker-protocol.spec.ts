import { describe, expect, it } from 'vitest'
import {
  deserializeWorkerError,
  serializeWorkerError,
} from '../../../src/infrastructure/sqlite/sqlite-worker-client.js'
import { StoreWorkerError } from '../../../src/domain/errors/store-worker-error.js'
import { StoreOverloadError } from '../../../src/domain/errors/store-overload-error.js'
import { StoreNotOpenError } from '../../../src/domain/errors/store-not-open-error.js'
import { SpecdCodeGraphError } from '../../../src/domain/errors/specd-code-graph-error.js'
import { BulkSessionStateError } from '../../../src/domain/errors/bulk-session-state-error.js'
import { InvalidGraphStoreConfigurationError } from '../../../src/domain/errors/invalid-graph-store-configuration-error.js'
import { GraphSchemaIncompatibleError } from '../../../src/domain/errors/graph-schema-incompatible-error.js'
import { RelationType } from '../../../src/domain/value-objects/relation-type.js'
import { type SQLiteWorkerRequest } from '../../../src/infrastructure/sqlite/sqlite-worker-protocol.js'

describe('SQLiteWorkerProtocol serialization', () => {
  it('round-trips typed traversal batch requests through structured clone', () => {
    const requests: SQLiteWorkerRequest[] = [
      { id: 1, op: 'getSymbolsByIds', payload: { symbolIds: ['a', 'b'] } },
      {
        id: 2,
        op: 'getIncomingSymbolRelations',
        payload: { symbolIds: ['a'], relationTypes: [RelationType.Calls] },
      },
      {
        id: 3,
        op: 'getOutgoingSymbolRelations',
        payload: { symbolIds: ['b'], relationTypes: [RelationType.Extends] },
      },
    ]

    expect(structuredClone(requests)).toEqual(requests)
  })

  it('serializes and deserializes standard Error instances', () => {
    const error = new Error('Database disk image is malformed')
    const serialized = serializeWorkerError(error)
    expect(serialized.name).toBe('Error')
    expect(serialized.message).toBe('Database disk image is malformed')

    const deserialized = deserializeWorkerError(serialized)
    expect(deserialized).toBeInstanceOf(Error)
    expect(deserialized.message).toBe('Database disk image is malformed')
  })

  it('preserves known domain error types during serialization and deserialization', () => {
    const storeNotOpen = new StoreNotOpenError()
    const serializedNotOpen = serializeWorkerError(storeNotOpen)
    expect(serializedNotOpen.code).toBe('STORE_NOT_OPEN')
    const deserializedNotOpen = deserializeWorkerError(serializedNotOpen)
    expect(deserializedNotOpen).toBeInstanceOf(StoreNotOpenError)
    expect(deserializedNotOpen.message).toBe(
      'Graph store is not open. Call open() before performing operations.',
    )

    const overload = new StoreOverloadError(100, 100)
    const serializedOverload = serializeWorkerError(overload)
    expect(serializedOverload.code).toBe('STORE_OVERLOAD')
    const deserializedOverload = deserializeWorkerError(serializedOverload)
    expect(deserializedOverload).toBeInstanceOf(StoreOverloadError)

    const workerErr = new StoreWorkerError('Worker thread crashed unexpectedly')
    const serializedWorkerErr = serializeWorkerError(workerErr)
    expect(serializedWorkerErr.code).toBe('STORE_WORKER_ERROR')
    const deserializedWorkerErr = deserializeWorkerError(serializedWorkerErr)
    expect(deserializedWorkerErr).toBeInstanceOf(StoreWorkerError)
  })

  it('round-trips the bulk-session, configuration, and schema error codes', () => {
    const bulk = new BulkSessionStateError('Bulk index session is already active')
    const serializedBulk = serializeWorkerError(bulk)
    expect(serializedBulk.code).toBe('BULK_SESSION_STATE')
    const deserializedBulk = deserializeWorkerError(serializedBulk)
    expect(deserializedBulk).toBeInstanceOf(BulkSessionStateError)
    expect(deserializedBulk.message).toBe('Bulk index session is already active')

    const config = new InvalidGraphStoreConfigurationError(
      'maxPendingOperations must be an integer >= 1',
    )
    const serializedConfig = serializeWorkerError(config)
    expect(serializedConfig.code).toBe('INVALID_GRAPH_STORE_CONFIGURATION')
    const deserializedConfig = deserializeWorkerError(serializedConfig)
    expect(deserializedConfig).toBeInstanceOf(InvalidGraphStoreConfigurationError)
    expect(deserializedConfig.message).toBe('maxPendingOperations must be an integer >= 1')

    const schema = new GraphSchemaIncompatibleError('schema 8 is incompatible with expected 9')
    const serializedSchema = serializeWorkerError(schema)
    expect(serializedSchema.code).toBe('GRAPH_SCHEMA_INCOMPATIBLE')
    const deserializedSchema = deserializeWorkerError(serializedSchema)
    expect(deserializedSchema).toBeInstanceOf(GraphSchemaIncompatibleError)
    expect(deserializedSchema.message).toBe('schema 8 is incompatible with expected 9')
  })

  it('attaches sqliteCode if available', () => {
    const sqliteErr = Object.assign(new Error('table already exists'), {
      code: 'SQLITE_ERROR',
    })
    const serialized = serializeWorkerError(sqliteErr)
    expect(serialized.sqliteCode).toBe('SQLITE_ERROR')

    const deserialized = deserializeWorkerError(serialized)
    expect(deserialized.message).toBe('table already exists')
    expect(deserialized).toBeInstanceOf(Error)
  })

  it('handles non-error objects gracefully during serialization', () => {
    const serialized = serializeWorkerError('raw string error message')
    expect(serialized.message).toBe('raw string error message')
    const deserialized = deserializeWorkerError(serialized)
    expect(deserialized.message).toBe('raw string error message')
  })
})

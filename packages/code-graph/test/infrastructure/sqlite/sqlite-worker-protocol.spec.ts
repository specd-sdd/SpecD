import { describe, expect, it } from 'vitest'
import {
  deserializeWorkerError,
  serializeWorkerError,
} from '../../../src/infrastructure/sqlite/sqlite-worker-client.js'
import { StoreWorkerError } from '../../../src/domain/errors/store-worker-error.js'
import { StoreOverloadError } from '../../../src/domain/errors/store-overload-error.js'
import { StoreNotOpenError } from '../../../src/domain/errors/store-not-open-error.js'
import { SpecdCodeGraphError } from '../../../src/domain/errors/specd-code-graph-error.js'

describe('SQLiteWorkerProtocol serialization', () => {
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

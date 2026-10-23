import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionReferenceStore } from '../../../src/application/services/session-reference-store.js'
import { InMemoryIndexSession } from '../../../src/application/use-cases/in-memory-index-session.js'
import { SQLiteGraphStore } from '../../../src/infrastructure/sqlite/sqlite-graph-store.js'
import {
  SymbolSpace,
  type LogicalSymbol,
} from '../../../src/domain/value-objects/symbol-reference.js'

describe('SessionReferenceStore', () => {
  let tempDir = ''
  let sqliteStore: SQLiteGraphStore

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'specd-session-ref-store-'))
    sqliteStore = new SQLiteGraphStore(tempDir)
    await sqliteStore.open()
  })

  afterEach(async () => {
    await sqliteStore.close()
    if (tempDir !== '') rmSync(tempDir, { recursive: true, force: true })
  })

  it('Given a symbol lacking stored qualifiedName, session and SQLite lookup reject derived spelling and match stored spelling equally', async () => {
    const parentSymbol: LogicalSymbol = {
      id: 'logical:pkg:service',
      workspace: 'pkg',
      surface: 'pkg:src/service.ts',
      name: 'UserService',
      space: SymbolSpace.Type,
      ownerId: undefined,
      memberSemantics: undefined,
      qualifiedName: 'App.Services.UserService',
    }

    const memberSymbolWithoutQualifiedName: LogicalSymbol = {
      id: 'logical:pkg:service:findUser',
      workspace: 'pkg',
      surface: 'pkg:src/service.ts',
      name: 'findUser',
      space: SymbolSpace.Value,
      ownerId: 'logical:pkg:service',
      memberSemantics: undefined,
      // qualifiedName intentionally undefined
    }

    const session = new InMemoryIndexSession()
    session.hydrateReferenceFacts({
      logicalSymbols: [parentSymbol, memberSymbolWithoutQualifiedName],
      declarations: [],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    await sqliteStore.replaceReferenceFacts({
      logicalSymbols: [parentSymbol, memberSymbolWithoutQualifiedName],
      declarations: [],
      publicBindings: [],
      localBindings: [],
      steps: [],
      coverage: [],
    })

    const sessionStore = new SessionReferenceStore(session)

    // 1. Explicitly stored spelling matches on both
    const storedQuery = ['App.Services.UserService']
    const sessionStoredResult = await sessionStore.findLogicalSymbolsByQualifiedNames(storedQuery)
    const sqliteStoredResult = await sqliteStore.findLogicalSymbolsByQualifiedNames(storedQuery)

    expect(sessionStoredResult).toHaveLength(1)
    expect(sessionStoredResult[0]?.id).toBe(parentSymbol.id)
    expect(sqliteStoredResult).toHaveLength(1)
    expect(sqliteStoredResult[0]?.id).toBe(parentSymbol.id)
    expect(sessionStoredResult).toEqual(sqliteStoredResult)

    // 2. Derived dotted spelling ('App.Services.UserService.findUser') is rejected by both
    const derivedQuery = ['App.Services.UserService.findUser']
    const sessionDerivedResult = await sessionStore.findLogicalSymbolsByQualifiedNames(derivedQuery)
    const sqliteDerivedResult = await sqliteStore.findLogicalSymbolsByQualifiedNames(derivedQuery)

    expect(sessionDerivedResult).toEqual([])
    expect(sqliteDerivedResult).toEqual([])
    expect(sessionDerivedResult).toEqual(sqliteDerivedResult)
  })
})

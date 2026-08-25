import { createSqliteGraphStoreFactory } from '../../../dist/public.js'

/** Exercises the force-shaped logical clear/close path inside the isolated child. */
export async function runGraphIndexTask(input) {
  const store = createSqliteGraphStoreFactory().create({ storagePath: input.storageRoot })
  await store.open()
  if (input.force) await store.clear()
  await store.close()
  return { force: input.force, pid: process.pid, state: 'closed' }
}

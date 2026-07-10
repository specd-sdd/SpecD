# Exploración: Abstracción de Almacenamiento y Modelo Checkout/Sync

Esta exploración documenta la estrategia de diseño arquitectónico propuesta para resolver el problema de la portabilidad del almacenamiento de cambios en `specd`, enlazando directamente con la propuesta planteada en el **Issue #10: "Storage abstraction: checkout/sync model for change artifact I/O"**.

---

## 1. El Problema Original (Issue #10)

Actualmente, el agente de IA escribe y lee directamente del sistema de archivos local (`changes/`, `drafts/`, `discarded/`), puenteando el puerto `ChangeRepository`. Esto impide:

1.  **Portabilidad:** Guardar los borradores o cambios en una base de datos centralizada (Postgres/SQLite) o en la nube (S3).
2.  **Control de Accesos/Escritura:** Validar si un workspace es de solo lectura (`readOnly`) antes de que el agente realice modificaciones físicas.
3.  **Higiene y Limpieza de Disco:** Cargar innecesariamente decenas de borradores e históricos en el sistema de archivos del usuario.

### Principio Fundamental:

El agente LLM requiere obligatoriamente interactuar con un **directorio de trabajo local (Staging Area)**. El diseño debe respetar esto de forma transparente.

---

## 2. Decisiones de Diseño Arquitectónico

Hemos consensuado un modelo de **Checkout/Sync Transparente** sustentado en tres pilares:

### A. Directorio de Staging en Memoria (`changesPath`)

En `specd.yaml`, el usuario configura adaptadores generales. Sin embargo, en memoria, `SpecdConfig.storage` siempre resuelve rutas locales absolutas de staging (`changesPath`, `draftsPath`, etc.):

- Si el adaptador es `fs`, apunta a su ruta configurada.
- Si el adaptador es `db`, por defecto crea una carpeta local en `.specd/changes` como área de trabajo.

### B. Repositorio Compositor (`CompositeChangeRepository`)

Para permitir que `changes`, `drafts` y `discarded` utilicen **adaptadores diferentes** (ej. cambios activos en PostgreSQL, borradores en disco local, descartados en S3) sin reescribir los casos de uso del Core, introducimos un compositor:

```typescript
export class CompositeChangeRepository extends ChangeRepository {
  constructor(
    private readonly active: ActiveStorage,
    private readonly drafts: DraftStorage,
    private readonly discarded: DiscardedStorage,
  ) {
    super()
  }

  // Las lecturas rápidas delegan directamente al adaptador correspondiente
  async list(): Promise<Change[]> {
    return this.active.list()
  }

  async listDrafts(): Promise<DraftedChangeView[]> {
    return this.drafts.listDrafts()
  }
}
```

### C. Lector bajo demanda (`ArtifactReader`) con Lectura Múltiple

Para evitar desbordamiento de memoria al mover cambios con muchos archivos (sin saturar la red con lecturas individuales $N+1$), la transferencia se realiza mediante un lector bajo demanda que soporta **lectura por lotes (batch)**.

---

## 3. Interfaces y Flujos Propuestos

### La Interfaz `ArtifactReader`

```typescript
export interface ArtifactReader {
  /**
   * Lee el contenido de un único archivo.
   */
  read(filename: string): Promise<string | null>

  /**
   * Lee los contenidos de múltiples archivos a la vez.
   * Devuelve un mapa de ruta relativa -> contenido.
   */
  readMultiple(filenames: string[]): Promise<Map<string, string>>

  /**
   * Cierra el lector y libera recursos (ej: descriptores o conexiones).
   */
  close(): Promise<void>
}
```

### Implementación del Lector en Base de Datos (Ejemplo Postgres)

El lector puede optimizar la lectura múltiple realizando una sola consulta SQL utilizando `IN`:

```typescript
class DbArtifactReader implements ArtifactReader {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly changeId: string,
  ) {}

  async read(filename: string): Promise<string | null> {
    const rows = await this.db.query(
      'SELECT content FROM change_artifacts WHERE change_id = $1 AND filename = $2',
      [this.changeId, filename],
    )
    return rows[0]?.content ?? null
  }

  async readMultiple(filenames: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    if (filenames.length === 0) return results

    const rows = await this.db.query(
      'SELECT filename, content FROM change_artifacts WHERE change_id = $1 AND filename IN ($2)',
      [this.changeId, filenames],
    )

    for (const row of rows) {
      results.set(row.filename, row.content)
    }
    return results
  }

  async close(): Promise<void> {
    // Liberar conexiones o memoria cache
  }
}
```

### Consumo en el Destino: Guardado por Chunks (`FsDraftStorage`)

El importador de destino controla el tamaño de lote (chunk) para mantener la huella de memoria plana:

```typescript
async importChange(change: Change, reader: ArtifactReader): Promise<void> {
  const allFiles = change.artifacts
    .flatMap(a => Array.from(a.files.values()))
    .filter(f => f.status !== 'missing' && f.status !== 'skipped')
    .map(f => f.filename);

  const BATCH_SIZE = 10; // Límite de archivos en memoria simultáneamente

  for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
    const batchFilenames = allFiles.slice(i, i + BATCH_SIZE);

    // El destino solicita activamente el lote al lector
    const batchContents = await reader.readMultiple(batchFilenames);

    for (const [filename, content] of batchContents.entries()) {
      const destPath = path.join(this.draftsPath, change.id, filename);
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.writeFile(destPath, content, 'utf8');
    }
  }
}
```

### El Flujo de Migración en el Compositor

Cuando un cambio activo pasa a borrador, el compositor acopla el lector y el escritor de forma transparente:

```typescript
// Dentro de CompositeChangeRepository
async mutate(name: string, fn: (change: Change) => Promise<T> | T): Promise<T> {
  return this.active.mutate(name, async (change) => {
    const result = await fn(change);

    if (change.isDrafted) {
      // 1. Obtenemos el lector del origen (ej: DB)
      const reader = this.active.getReader(change);

      try {
        // 2. Importamos en el destino (ej: FS) controlando la memoria
        await this.drafts.importChange(change, reader);
      } finally {
        await reader.close();
      }

      // 3. Eliminamos el origen una vez completado con éxito
      await this.active.delete(change);
    }

    return result;
  });
}
```

---

## 4. Beneficios del Enfoque Híbrido

1.  **Consumo de memoria controlado:** El destino procesa los archivos en lotes (`BATCH_SIZE`), asegurando estabilidad incluso con cambios gigantescos.
2.  **Rendimiento optimizado en FS:** Si ambos adaptadores son del tipo `fs`, el compositor realiza una optimización rápida utilizando `fs.promises.rename` de forma instantánea.
3.  **Independencia de configuración:** Cada adaptador maneja sus propias conexiones y credenciales sin acoplamiento.
4.  **Cero coste en listados:** Comandos como `specd change list` o `specd change show` se resuelven directamente en la base de datos sin leer ni escribir un solo byte en el sistema de archivos local.

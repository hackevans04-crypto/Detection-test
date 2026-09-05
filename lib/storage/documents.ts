'use client'

/**
 * Almacén de los archivos de respaldo.
 *
 * Los metadatos de un respaldo viven en el expediente; los bytes no. Un
 * expediente con tres escaneos y una hoja de cálculo pesa varios megabytes, y
 * `localStorage` -donde vive el resto del expediente- tiene una cuota de unos
 * pocos y guarda texto: meter ahí un PDF en base64 agota el almacén y se lleva
 * por delante el expediente entero.
 *
 * Por eso los archivos van a IndexedDB, que guarda binario y tiene cuota real.
 * Son privados del navegador del profesional: no se suben a ningún sitio ni se
 * envían al proveedor de IA. Sustituir esto por almacenamiento de servidor es
 * reescribir este fichero, no la aplicación.
 */

const DB_NAME = 'detection-test.documents'
const DB_VERSION = 1
const STORE = 'files'

export class DocumentStoreError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'DocumentStoreError'
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new DocumentStoreError('El almacenamiento de documentos no está disponible en este navegador.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () =>
      reject(new DocumentStoreError('No se pudo abrir el almacén de documentos.', request.error))
  })
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = work(transaction.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () =>
          reject(new DocumentStoreError('No se pudo completar la operación sobre el documento.', request.error))
        transaction.oncomplete = () => db.close()
      }),
  )
}

/**
 * Huella del contenido, para poder detectar después que el archivo guardado es
 * el mismo que se adjuntó. SHA-256 por `crypto.subtle`, que sólo existe en
 * contexto seguro; cuando no está, el respaldo se guarda igual y la huella
 * queda declarada como no disponible en vez de fabricarse.
 */
export async function checksumOf(buffer: ArrayBuffer): Promise<string> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return 'no-disponible'
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function putDocument(id: string, file: File): Promise<{ checksum: string; size: number }> {
  const buffer = await file.arrayBuffer()
  const checksum = await checksumOf(buffer)
  await run('readwrite', (store) => store.put({ blob: file, mime: file.type, name: file.name }, id))
  return { checksum, size: file.size }
}

export async function getDocument(id: string): Promise<Blob | null> {
  const record = await run<{ blob: Blob } | undefined>('readonly', (store) => store.get(id))
  return record?.blob ?? null
}

export async function deleteDocument(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id))
}

/**
 * URL temporal para abrir un respaldo. Quien la pide es responsable de
 * revocarla: un object URL vivo mantiene el archivo en memoria.
 */
export async function documentObjectUrl(id: string): Promise<string | null> {
  const blob = await getDocument(id)
  return blob ? URL.createObjectURL(blob) : null
}

import { describe, expect, it } from 'vitest'
import {
  extensionOf,
  inspectFile,
  isIgnorableName,
  safeArchivePath,
  sniffMime,
} from '@/lib/instruments/import/file-safety'

const head = (...bytes: number[]) => new Uint8Array(bytes)
const PDF = head(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31)
const PNG = head(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)
const ZIP = head(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00)
const RAR = head(0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01)
const EXE = head(0x4d, 0x5a, 0x90, 0x00)
const OLE = head(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)

const file = (over: Partial<Parameters<typeof inspectFile>[0]> = {}) =>
  inspectFile({ path: 'MANUAL.pdf', size: 1024, declaredMime: 'application/pdf', head: PDF, ...over })

describe('firma de contenido', () => {
  it('reconoce los formatos del material psicopedagógico', () => {
    expect(sniffMime(PDF)?.kind).toBe('pdf')
    expect(sniffMime(PNG)?.kind).toBe('image')
    expect(sniffMime(ZIP)?.kind).toBe('zip')
    expect(sniffMime(RAR)?.kind).toBe('rar')
  })

  it('no adivina cuando no reconoce la firma', () => {
    expect(sniffMime(head(0x00, 0x01, 0x02, 0x03))).toBeNull()
  })
})

describe('verificación de archivos', () => {
  it('acepta un manual PDF', () => {
    expect(file()).toMatchObject({ ok: true, kind: 'pdf', ignorable: false })
  })

  it('bloquea un ejecutable por extensión', () => {
    expect(file({ path: 'instalador.exe', head: EXE })).toMatchObject({ ok: false, ignorable: false })
  })

  it('bloquea un ejecutable renombrado a PDF: manda el contenido, no el nombre', () => {
    const verdict = file({ path: 'MANUAL.pdf', head: EXE })
    expect(verdict.ok).toBe(false)
    expect(verdict.reason).toContain('ejecutable')
  })

  it('acepta un xlsx aunque su firma sea la de un ZIP', () => {
    const verdict = file({ path: 'MACI.xlsx', head: ZIP, declaredMime: '' })
    expect(verdict.ok).toBe(true)
    expect(verdict.kind).toBe('spreadsheet')
    expect(verdict.warnings).toEqual([])
  })

  it('acepta un xls antiguo con firma OLE', () => {
    expect(file({ path: 'MACI.xls', head: OLE })).toMatchObject({ ok: true, kind: 'spreadsheet' })
  })

  it('avisa cuando la extensión no corresponde con el contenido', () => {
    const verdict = file({ path: 'cuadernillo.pdf', head: PNG })
    expect(verdict.ok).toBe(true)
    expect(verdict.warnings.join(' ')).toContain('no corresponde')
  })

  it('rechaza un archivo vacío y uno desmesurado', () => {
    expect(file({ size: 0 }).ok).toBe(false)
    expect(file({ size: 500 * 1024 * 1024 }).ok).toBe(false)
  })

  it('marca como auxiliar el ruido del sistema de archivos, sin romper el paquete', () => {
    const verdict = file({ path: 'MACI/Thumbs.db' })
    expect(verdict).toMatchObject({ ok: false, ignorable: true })
  })

  it('no rechaza un formato desconocido, sólo lo señala', () => {
    const verdict = file({ path: 'notas.xyz', head: head(0x00, 0x11), declaredMime: '' })
    expect(verdict.ok).toBe(true)
    expect(verdict.kind).toBe('unknown')
    expect(verdict.warnings.join(' ')).toContain('No se reconoció')
  })
})

describe('archivos auxiliares', () => {
  it.each(['.DS_Store', 'Thumbs.db', '.picasa.ini', 'carpeta/__MACOSX/x.pdf', '._MANUAL.pdf', '~$manual.docx'])(
    'ignora %s',
    (name) => {
      expect(isIgnorableName(name)).toBe(true)
    },
  )

  it('no confunde material real con ruido', () => {
    expect(isIgnorableName('MACI/MANUAL MACI.pdf')).toBe(false)
  })
})

describe('rutas dentro de un comprimido', () => {
  it('normaliza separadores y quita el prefijo de raíz', () => {
    expect(safeArchivePath('MACI\\manual\\MANUAL.pdf')).toBe('MACI/manual/MANUAL.pdf')
    expect(safeArchivePath('/MACI/MANUAL.pdf')).toBe('MACI/MANUAL.pdf')
    expect(safeArchivePath('./MACI/./MANUAL.pdf')).toBe('MACI/MANUAL.pdf')
  })

  it('rechaza el escape de directorio en todas sus formas', () => {
    expect(safeArchivePath('../../etc/passwd')).toBeNull()
    expect(safeArchivePath('MACI/../../fuera.pdf')).toBeNull()
    expect(safeArchivePath('MACI\\..\\..\\fuera.pdf')).toBeNull()
  })

  it('rechaza rutas absolutas y UNC', () => {
    expect(safeArchivePath('C:/Windows/system32/x.dll')).toBeNull()
    expect(safeArchivePath('//servidor/recurso/x.pdf')).toBeNull()
  })

  it('rechaza directorios y rutas vacías', () => {
    expect(safeArchivePath('MACI/')).toBeNull()
    expect(safeArchivePath('')).toBeNull()
  })

  it('rechaza un byte nulo en la ruta', () => {
    expect(safeArchivePath('MANUAL\0.pdf')).toBeNull()
  })
})

describe('extensiones', () => {
  it('extrae la última extensión en minúsculas', () => {
    expect(extensionOf('MANUAL MACI.PDF')).toBe('pdf')
    expect(extensionOf('archivo.tar.gz')).toBe('gz')
    expect(extensionOf('sin-extension')).toBe('')
  })
})

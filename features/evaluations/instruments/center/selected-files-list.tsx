'use client'

import { Check, X } from 'lucide-react'

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function SelectedFilesList({
  files,
  onRemove,
  onClear,
}: {
  files: File[]
  onRemove: (index: number) => void
  onClear: () => void
}) {
  if (files.length === 0) return null

  const total = files.reduce((sum, file) => sum + file.size, 0)

  return (
    <section className="dt-selected-material" aria-labelledby="material-seleccionado-title">
      <div className="dt-selected-material-head">
        <div>
          <h3 id="material-seleccionado-title">Material seleccionado</h3>
          <p>
            {files.length} {files.length === 1 ? 'archivo' : 'archivos'} - {formatFileSize(total)}
          </p>
        </div>
        <button type="button" className="dt-btn dt-btn-ghost dt-btn-sm" onClick={onClear}>
          Limpiar selección
        </button>
      </div>
      <ul className="dt-selected-files">
        {files.map((file, index) => (
          <li key={`${file.name}-${file.size}-${index}`}>
            <span className="dt-file-name">{file.name}</span>
            <span className="dt-file-size">{formatFileSize(file.size)}</span>
            <span className="dt-file-ready">
              <Check aria-hidden="true" />
              Listo
            </span>
            <button type="button" className="dt-icon-btn" aria-label={`Eliminar ${file.name}`} onClick={() => onRemove(index)}>
              <X aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

import fs from 'node:fs'
import path from 'node:path'

const [, , outputDirectory, ...modelPaths] = process.argv

if (!outputDirectory || modelPaths.length === 0) {
  throw new Error('Usage: node scripts/extract-glb-images.mjs <output-directory> <model.glb> [...]')
}

fs.mkdirSync(outputDirectory, { recursive: true })

const extensionFor = (mimeType) => mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg'

for (const modelPath of modelPaths) {
  const bytes = fs.readFileSync(modelPath)
  if (bytes.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${modelPath} is not a binary glTF file`)

  let offset = 12
  let json
  let binary
  while (offset < bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset)
    const chunkType = bytes.readUInt32LE(offset + 4)
    const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength)
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8').replace(/\0+$/g, ''))
    if (chunkType === 0x004e4942) binary = chunk
    offset += 8 + chunkLength
  }

  if (!json || !binary) throw new Error(`${modelPath} does not contain JSON and BIN chunks`)
  const stem = path.basename(modelPath, path.extname(modelPath)).replace(/[^a-z0-9_-]+/gi, '-')
  for (const [index, image] of (json.images ?? []).entries()) {
    if (image.bufferView === undefined) continue
    const view = json.bufferViews[image.bufferView]
    const start = view.byteOffset ?? 0
    const imageBytes = binary.subarray(start, start + view.byteLength)
    const outputPath = path.resolve(outputDirectory, `${stem}-${index + 1}.${extensionFor(image.mimeType)}`)
    fs.writeFileSync(outputPath, imageBytes)
    process.stdout.write(`${outputPath}\n`)
  }
}

import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import sharp from 'sharp'

const downloads = 'C:/Users/PC/Downloads'
const requested = process.argv.slice(2)
const files = requested.length ? requested : fs.readdirSync(downloads)
  .filter((file) => /^Hi3D.*\.glb$/i.test(file))
  .map((file) => ({ file, modified: fs.statSync(path.join(downloads, file)).mtimeMs }))
  .sort((a, b) => b.modified - a.modified)
  .slice(0, 15)
  .map(({ file }) => path.join(downloads, file))

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const report = []
for (const file of files) {
  const document = await io.read(path.resolve(file))
  const root = document.getRoot()
  let triangles = 0
  for (const mesh of root.listMeshes()) for (const primitive of mesh.listPrimitives()) {
    const indices = primitive.getIndices()
    triangles += (indices ? indices.getCount() : primitive.getAttribute('POSITION').getCount()) / 3
  }
  const textures = []
  for (const texture of root.listTextures()) {
    const image = texture.getImage()
    const metadata = image ? await sharp(Buffer.from(image), { failOn: 'none' }).metadata() : {}
    textures.push({ name: texture.getName() || '(embedded)', width: metadata.width ?? 0, height: metadata.height ?? 0, mimeType: texture.getMimeType() })
  }
  report.push({
    file: path.basename(file),
    bytes: fs.statSync(file).size,
    triangles,
    meshes: root.listMeshes().length,
    materials: root.listMaterials().length,
    textures,
    nodes: root.listNodes().length,
    animations: root.listAnimations().length,
  })
}
console.log(JSON.stringify(report, null, 2))

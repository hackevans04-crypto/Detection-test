import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

globalThis.self = globalThis
globalThis.ProgressEvent ??= class ProgressEvent {}
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} })

const W = 220, H = 220

function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crcTable = png.crcTable ??= (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
    let crc = 0xffffffff
    for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8)
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([len, body, crcBuf])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

// Densidad de vértices proyectados = mapa de ocupación. Revela la silueta real
// del modelo sin necesidad de un contexto WebGL.
function project(positions, bounds, axes) {
  const acc = new Float32Array(W * H)
  const size = bounds.getSize(new THREE.Vector3())
  const min = bounds.min
  const su = Math.max(size[axes[0]], 1e-6), sv = Math.max(size[axes[1]], 1e-6)
  const scale = Math.min(W / su, H / sv) * 0.92
  const ou = (W - su * scale) / 2, ov = (H - sv * scale) / 2
  const v = new THREE.Vector3()
  for (let i = 0; i < positions.count; i++) {
    v.fromBufferAttribute(positions, i)
    const u = Math.round(ou + (v[axes[0]] - min[axes[0]]) * scale)
    const w = Math.round(H - ov - (v[axes[1]] - min[axes[1]]) * scale)
    if (u < 0 || u >= W || w < 0 || w >= H) continue
    acc[w * W + u] += 1
  }
  let max = 0
  for (const value of acc) if (value > max) max = value
  const rgb = Buffer.alloc(W * H * 3)
  for (let i = 0; i < acc.length; i++) {
    const t = max ? Math.min(1, Math.pow(acc[i] / max, 0.32)) : 0
    rgb[i * 3] = Math.round(8 + t * 60); rgb[i * 3 + 1] = Math.round(14 + t * 200); rgb[i * 3 + 2] = Math.round(28 + t * 255)
  }
  return rgb
}

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const out = path.join(process.cwd(), 'tmp', 'silhouettes')
fs.mkdirSync(out, { recursive: true })

for (const file of process.argv.slice(2)) {
  const bytes = fs.readFileSync(file)
  const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
  gltf.scene.updateMatrixWorld(true)
  const points = []
  const scratch = new THREE.Vector3()
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    // getX/getY/getZ respetan `normalized`, así que la cuantización de meshopt
    // se deshace aquí en vez de copiar enteros crudos.
    const attribute = object.geometry.attributes.position
    for (let i = 0; i < attribute.count; i++) {
      scratch.set(attribute.getX(i), attribute.getY(i), attribute.getZ(i)).applyMatrix4(object.matrixWorld)
      points.push(scratch.x, scratch.y, scratch.z)
    }
  })
  const positions = new THREE.BufferAttribute(new Float32Array(points), 3)
  const bounds = new THREE.Box3().setFromBufferAttribute(positions)
  const name = path.basename(file, '.glb')
  for (const [label, axes] of [['front', ['x', 'y']], ['side', ['z', 'y']], ['top', ['x', 'z']]]) {
    fs.writeFileSync(path.join(out, `${name}-${label}.png`), png(W, H, project(positions, bounds, axes)))
  }
  const size = bounds.getSize(new THREE.Vector3())
  console.log(`${name}: W=${size.x.toFixed(3)} H=${size.y.toFixed(3)} D=${size.z.toFixed(3)}  ratio H/W=${(size.y / size.x).toFixed(2)}`)
}

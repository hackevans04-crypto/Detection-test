import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
globalThis.self = globalThis
globalThis.ProgressEvent ??= class ProgressEvent {}
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} })
const W = 240, H = 240
function png(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  const table = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })()
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(type, 'ascii'), data]); let crc = 0xffffffff; for (const b of body) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8); const c = Buffer.alloc(4); c.writeUInt32BE((crc ^ 0xffffffff) >>> 0); return Buffer.concat([len, body, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const file = process.argv[2]
const bytes = fs.readFileSync(file)
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
gltf.scene.updateMatrixWorld(true)
let mesh; gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) mesh = o })
const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
const position = geometry.attributes.position
const index = geometry.index
const triCount = index ? index.count / 3 : position.count / 3
// Regla derivada de la componente conexa #0 (el cerebro): elipsoide ajustado
// a su caja real. Los arcos que pasan cerca quedan fuera aunque su radio XZ
// sea pequeno, que era la fuga de la version por umbrales.
const BRAIN_CENTER = new THREE.Vector3(-0.002, 0.078, 0.000)
const BRAIN_RADII = new THREE.Vector3(0.315, 0.332, 0.3475)
const BRAIN_TOLERANCE = 1.06
const PLATFORM_Y = -0.30
const groups = { platform: [], brain: [], rings: [] }
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
for (let t = 0; t < triCount; t++) {
  const i0 = index ? index.getX(t * 3) : t * 3, i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
  a.set(position.getX(i0), position.getY(i0), position.getZ(i0))
  b.set(position.getX(i1), position.getY(i1), position.getZ(i1))
  c.set(position.getX(i2), position.getY(i2), position.getZ(i2))
  const x = (a.x + b.x + c.x) / 3, y = (a.y + b.y + c.y) / 3, z = (a.z + b.z + c.z) / 3
  const dx = (x - BRAIN_CENTER.x) / BRAIN_RADII.x
  const dy = (y - BRAIN_CENTER.y) / BRAIN_RADII.y
  const dz = (z - BRAIN_CENTER.z) / BRAIN_RADII.z
  const inside = dx * dx + dy * dy + dz * dz <= BRAIN_TOLERANCE
  const key = inside ? 'brain' : y < PLATFORM_Y ? 'platform' : 'rings'
  groups[key].push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
}
const out = path.join(process.cwd(), 'tmp', 'silhouettes'); fs.mkdirSync(out, { recursive: true })
const full = new THREE.Box3().setFromBufferAttribute(position)
for (const [name, pts] of Object.entries(groups)) {
  console.log(`${name}: ${(pts.length / 9).toLocaleString()} triangulos`)
  for (const [label, axes] of [['front', ['x', 'y']], ['side', ['z', 'y']]]) {
    const acc = new Float32Array(W * H)
    const size = full.getSize(new THREE.Vector3()), min = full.min
    const iu = axes[0] === 'x' ? 0 : 2, iv = 1
    const su = axes[0] === 'x' ? size.x : size.z, sv = size.y
    const mu = axes[0] === 'x' ? min.x : min.z, mv = min.y
    const scale = Math.min(W / su, H / sv) * 0.92
    const ou = (W - su * scale) / 2, ov = (H - sv * scale) / 2
    for (let i = 0; i < pts.length; i += 3) {
      const u = Math.round(ou + (pts[i + iu] - mu) * scale), w = Math.round(H - ov - (pts[i + iv] - mv) * scale)
      if (u >= 0 && u < W && w >= 0 && w < H) acc[w * W + u] += 1
    }
    let max = 0; for (const value of acc) if (value > max) max = value
    const rgb = Buffer.alloc(W * H * 3)
    for (let i = 0; i < acc.length; i++) { const t = max ? Math.min(1, (acc[i] / max) ** 0.32) : 0; rgb[i * 3] = 8 + t * 60 | 0; rgb[i * 3 + 1] = 14 + t * 200 | 0; rgb[i * 3 + 2] = 28 + t * 255 | 0 }
    fs.writeFileSync(path.join(out, `split-${name}-${label}.png`), png(W, H, rgb))
  }
}

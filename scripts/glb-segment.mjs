import fs from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
globalThis.self = globalThis
globalThis.ProgressEvent ??= class ProgressEvent {}
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} })

const file = process.argv[2]
const bytes = fs.readFileSync(file)
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
gltf.scene.updateMatrixWorld(true)

let mesh
gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) mesh = o })
const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
const position = geometry.attributes.position
const bounds = new THREE.Box3().setFromBufferAttribute(position)
const center = bounds.getCenter(new THREE.Vector3())
const size = bounds.getSize(new THREE.Vector3())
console.log('bounds', JSON.stringify({ min: bounds.min, max: bounds.max }))
console.log('center', JSON.stringify(center), 'size', JSON.stringify(size))

// Histograma de Y: separa plataforma (abajo) de cerebro (arriba).
const yBins = new Array(20).fill(0)
// Histograma radial XZ: separa núcleo del cerebro de los anillos orbitales.
const rBins = new Array(20).fill(0)
const v = new THREE.Vector3()
let maxR = 0
for (let i = 0; i < position.count; i++) {
  v.set(position.getX(i), position.getY(i), position.getZ(i))
  maxR = Math.max(maxR, Math.hypot(v.x - center.x, v.z - center.z))
}
for (let i = 0; i < position.count; i++) {
  v.set(position.getX(i), position.getY(i), position.getZ(i))
  yBins[Math.min(19, Math.floor((v.y - bounds.min.y) / size.y * 20))]++
  rBins[Math.min(19, Math.floor(Math.hypot(v.x - center.x, v.z - center.z) / maxR * 20))]++
}
const bar = (n, max) => '#'.repeat(Math.round(n / max * 54))
const yMax = Math.max(...yBins), rMax = Math.max(...rBins)
console.log('\n--- distribucion en Y (abajo -> arriba), y absoluto ---')
yBins.forEach((n, i) => console.log(`y ${(bounds.min.y + size.y * i / 20).toFixed(3).padStart(7)}..${(bounds.min.y + size.y * (i + 1) / 20).toFixed(3).padStart(7)} ${String(n).padStart(7)} ${bar(n, yMax)}`))
console.log(`\n--- distribucion radial XZ (maxR=${maxR.toFixed(3)}) ---`)
rBins.forEach((n, i) => console.log(`r ${(maxR * i / 20).toFixed(3).padStart(6)}..${(maxR * (i + 1) / 20).toFixed(3).padStart(6)} ${String(n).padStart(7)} ${bar(n, rMax)}`))

import fs from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
globalThis.self = globalThis
globalThis.ProgressEvent ??= class ProgressEvent {}
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} })

const bytes = fs.readFileSync(process.argv[2])
const gltf = await new THREE.LoadingManager && await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  .parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '')
gltf.scene.updateMatrixWorld(true)
let mesh; gltf.scene.traverse((o) => { if (o instanceof THREE.Mesh) mesh = o })
const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
const position = geometry.attributes.position
const index = geometry.index
const vertexCount = position.count

// Vértices coincidentes se sueldan por rejilla espacial: la malla exportada
// duplica vértices en las costuras UV y sin soldar todo saldría desconectado.
const box = new THREE.Box3().setFromBufferAttribute(position)
const size = box.getSize(new THREE.Vector3())
const cell = Math.max(size.x, size.y, size.z) / 4096
const weld = new Map()
const canonical = new Int32Array(vertexCount)
for (let i = 0; i < vertexCount; i++) {
  const key = `${Math.round(position.getX(i) / cell)},${Math.round(position.getY(i) / cell)},${Math.round(position.getZ(i) / cell)}`
  const found = weld.get(key)
  if (found === undefined) { weld.set(key, i); canonical[i] = i } else canonical[i] = found
}
console.log(`vertices ${vertexCount.toLocaleString()} -> soldados ${weld.size.toLocaleString()}`)

const parent = new Int32Array(vertexCount)
for (let i = 0; i < vertexCount; i++) parent[i] = canonical[i]
const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x] } return x }
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
const triCount = index ? index.count / 3 : vertexCount / 3
for (let t = 0; t < triCount; t++) {
  const i0 = index ? index.getX(t * 3) : t * 3, i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1, i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
  union(i0, i1); union(i1, i2)
}
const stats = new Map()
const v = new THREE.Vector3()
for (let t = 0; t < triCount; t++) {
  const i0 = index ? index.getX(t * 3) : t * 3
  const root = find(i0)
  let entry = stats.get(root)
  if (!entry) { entry = { tris: 0, box: new THREE.Box3() }; stats.set(root, entry) }
  entry.tris++
  for (const k of [0, 1, 2]) {
    const idx = index ? index.getX(t * 3 + k) : t * 3 + k
    entry.box.expandByPoint(v.set(position.getX(idx), position.getY(idx), position.getZ(idx)))
  }
}
const list = [...stats.entries()].sort((a, b) => b[1].tris - a[1].tris)
console.log(`\ncomponentes conexas: ${list.length}\n`)
list.slice(0, 25).forEach(([root, entry], i) => {
  const c = entry.box.getCenter(new THREE.Vector3()), s = entry.box.getSize(new THREE.Vector3())
  console.log(`#${String(i).padStart(2)} tris ${String(entry.tris).padStart(7)}  centro(${c.x.toFixed(3)},${c.y.toFixed(3)},${c.z.toFixed(3)})  tam(${s.x.toFixed(3)},${s.y.toFixed(3)},${s.z.toFixed(3)})`)
})
const tail = list.slice(25).reduce((sum, [, e]) => sum + e.tris, 0)
if (tail) console.log(`... y ${list.length - 25} componentes mas con ${tail.toLocaleString()} triangulos`)

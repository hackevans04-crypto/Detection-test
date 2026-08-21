import fs from 'node:fs'
import path from 'node:path'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'

globalThis.self = globalThis
globalThis.ProgressEvent ??= class ProgressEvent {}
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} })

const root = process.cwd()
const modelsDirectory = path.join(root, 'public', 'detection-home', 'hero', 'models')
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
const round = (value) => Number(value.toFixed(6))
const vector = (value) => ({ x: round(value.x), y: round(value.y), z: round(value.z) })

async function auditModel(absolutePath) {
  const file = path.basename(absolutePath)
  const bytes = fs.readFileSync(absolutePath)
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const gltf = await loader.parseAsync(arrayBuffer, '')
  const scene = gltf.scene
  scene.updateMatrixWorld(true)

  const bounds = new THREE.Box3().setFromObject(scene, true)
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const sphere = bounds.getBoundingSphere(new THREE.Sphere())
  const nodes = []
  const meshes = []
  const materials = new Map()
  const textures = new Set()
  let triangles = 0

  scene.traverse((object) => {
    nodes.push({
      name: object.name || '(unnamed)',
      type: object.type,
      position: vector(object.position),
      rotation: vector(object.rotation),
      scale: vector(object.scale),
    })
    if (!(object instanceof THREE.Mesh)) return

    const geometry = object.geometry
    const drawCount = geometry.index?.count ?? geometry.attributes.position?.count ?? 0
    const primitiveTriangles = Math.floor(drawCount / 3)
    triangles += primitiveTriangles
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]
    meshMaterials.forEach((material) => {
      materials.set(material.uuid, {
        name: material.name || '(unnamed)',
        type: material.type,
        transparent: material.transparent,
        opacity: round(material.opacity),
      })
      for (const key of Object.keys(material)) {
        const value = material[key]
        if (value?.isTexture) textures.add(value.name || `${key}:${value.source?.data?.name || '(embedded)'}`)
      }
    })
    meshes.push({
      name: object.name || '(unnamed)',
      geometry: geometry.name || '(unnamed)',
      materials: meshMaterials.map((material) => material.name || '(unnamed)'),
      triangles: primitiveTriangles,
      localPosition: vector(object.position),
      localScale: vector(object.scale),
      localBounds: geometry.boundingBox ? {
        min: vector(geometry.boundingBox.min),
        max: vector(geometry.boundingBox.max),
      } : null,
      localRadius: geometry.boundingSphere ? round(geometry.boundingSphere.radius) : null,
    })
  })

  return {
    file,
    bytes: bytes.byteLength,
    megabytes: round(bytes.byteLength / 1024 / 1024),
    scene: scene.name || '(unnamed)',
    rootPivot: vector(scene.position),
    bounds: { min: vector(bounds.min), max: vector(bounds.max) },
    dimensions: vector(size),
    center: vector(center),
    boundingSphere: { center: vector(sphere.center), radius: round(sphere.radius) },
    triangles,
    animations: gltf.animations.map((clip) => ({ name: clip.name || '(unnamed)', duration: round(clip.duration), tracks: clip.tracks.length })),
    materials: [...materials.values()],
    textures: [...textures],
    nodes,
    meshes,
  }
}

const requestedPaths = process.argv.slice(2)
const files = requestedPaths.length
  ? requestedPaths.map((file) => path.resolve(file))
  : fs.readdirSync(modelsDirectory)
      .filter((file) => /\.glb$/i.test(file))
      .sort()
      .map((file) => path.join(modelsDirectory, file))
const report = []
for (const file of files) report.push(await auditModel(file))
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)

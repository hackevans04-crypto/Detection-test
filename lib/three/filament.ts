import * as THREE from 'three'

/**
 * Parche de shader compartido para "filamentos" y "pulsos" de energía.
 *
 * Vivía sólo en `hero-scene.tsx`. Se extrae aquí para que el capítulo
 * Plataforma pueda vestir sus propios tubos/esferas con el mismo lenguaje
 * visual del relevo y el interior del cerebro, en vez de reinventar el GLSL
 * o dejar el corredor de datos con un material plano. Nada del comportamiento
 * cambia respecto al original: es exactamente el mismo parche, sólo movido.
 */

/**
 * Reloj compartido de los filamentos. Uno solo para todos: cada tubo no
 * necesita su propio uniforme de tiempo ni su propio `useFrame`. Ambos
 * capítulos ya comparten `signal.time` (`SharedPlatformDirector` copia el
 * reloj de Inicio a Plataforma), así que un único reloj de filamento mantiene
 * el mismo lenguaje de pulso en las dos escenas.
 */
export const filamentClock = { value: 0 }

/**
 * Convierte un tubo plano en un filamento de energía.
 *
 * Los caminos de señal eran `TubeGeometry` con `MeshBasicMaterial`: radio
 * constante en el mundo y material sin iluminar, así que dentro del sujeto
 * —donde la cámara pasa muy cerca— se leían como placas cian de ancho
 * uniforme, cortadas en seco en los extremos.
 *
 * Se corrige inyectando en el shader ya compilado en lugar de sustituir el
 * material: así siguen funcionando la opacidad, el color y la mezcla que el
 * bucle por fotograma escribe sobre estos mismos objetos.
 *
 * Con `vUv` del tubo se obtiene el corte transversal (y) y el recorrido (x):
 * de ahí salen el núcleo fino, el desvanecido del borde, el afilado de las
 * puntas y un pulso que viaja por la ruta.
 */
export function makeFilament(material: THREE.Material | null, seed: number) {
  const patched = material as (THREE.Material & { __filament?: boolean }) | null
  if (!patched || patched.__filament) return
  patched.__filament = true
  patched.defines = { ...(patched.defines ?? {}), USE_UV: '' }
  patched.onBeforeCompile = (shader) => {
    shader.uniforms.uFilTime = filamentClock
    shader.uniforms.uFilSeed = { value: seed * 0.37 }
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFilTime;
        uniform float uFilSeed;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        // Corte transversal: el brillo se concentra en la línea central.
        float filAcross = sin(vUv.y * 3.14159265);
        float filCore = pow(max(filAcross, 0.0), 6.0);
        // Puntas afiladas: un tubo cortado en recto se lee como cinta.
        float filTaper = smoothstep(0.0, 0.11, vUv.x) * smoothstep(1.0, 0.89, vUv.x);
        // Pulso que recorre la ruta: energía en tránsito, no tubo encendido.
        float filHead = fract(uFilTime * 0.17 + uFilSeed);
        float filDelta = vUv.x - filHead;
        filDelta -= floor(filDelta + 0.5);
        float filPulse = filDelta <= 0.0 && filDelta > -0.24
          ? pow(1.0 + filDelta / 0.24, 3.0)
          : 0.0;
        gl_FragColor.rgb *= 0.8 + filCore * 1.45 + filPulse * 2.1;
        gl_FragColor.a *= (0.2 + filCore * 0.95) * filTaper * (0.6 + filPulse * 1.5);`,
      )
  }
  patched.needsUpdate = true
}

/**
 * Convierte una esfera de pulso plana en un evento con núcleo y halo.
 *
 * Las esferas de pulso usan `MeshBasicMaterial`, que pinta el color plano en
 * todo el disco. Medido en el hueco entre Análisis y Acompañamiento: el perfil
 * de luminancia iba 217 · 217 · 216 · 212 · 204 a lo largo de 90 px, es decir
 * un círculo sin caída. No estaba quemado —el pico no llegaba a 255— pero al
 * no tener degradado se leía como una mancha sin detalle.
 *
 * Para una esfera centrada en el origen la normal es la propia posición, así
 * que basta llevarla a espacio de vista: su componente Z vale 1 mirando a
 * cámara y 0 en la silueta. De ahí sale la caída, sin tocar geometría ni la
 * opacidad que el bucle escribe sobre este material.
 */
export function makePulse(material: THREE.Material | null) {
  const patched = material as (THREE.Material & { __pulse?: boolean }) | null
  if (!patched || patched.__pulse) return
  patched.__pulse = true
  patched.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPulseN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPulseN = normalize(normalMatrix * normalize(position));`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vPulseN;`)
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        // 1 mirando a cámara, 0 en la silueta: la caída del propio volumen.
        float pulseFacing = clamp(vPulseN.z, 0.0, 1.0);
        float pulseCore = pow(pulseFacing, 2.4);
        float pulseHalo = pow(pulseFacing, 0.55);
        // Núcleo claro, halo que sobrevive hasta el borde: evento, no mancha.
        gl_FragColor.rgb *= 0.5 + pulseCore * 0.85;
        gl_FragColor.a *= 0.18 + pulseCore * 0.62 + pulseHalo * 0.2;`,
      )
  }
  patched.needsUpdate = true
}

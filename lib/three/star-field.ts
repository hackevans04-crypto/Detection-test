/**
 * Núcleo del "punto estrella" compartido entre Inicio y Plataforma.
 *
 * `LivingStars` (`cinematic-sky.tsx`) definía este fragment shader en
 * solitario: núcleo blanco diminuto, halo de color que cae rápido, cola en
 * cruz sólo en las estrellas grandes. Plataforma pedía ese mismo lenguaje
 * ("plataforma no tiene la transacción de partículas como inicio") pero sus
 * nubes orbitan en el mundo alrededor del cubo/núcleo, no en el plano de
 * pantalla alrededor del cerebro — así que sólo el fragment shader (que no
 * sabe nada de cómo se calculó la posición, sólo lee vPulse/vColor/vFlare) se
 * comparte tal cual; cada escena sigue teniendo su propio vertex shader
 * porque su geometría de órbita es distinta. Único cambio real frente al
 * original de Inicio: `uOpacity`, para que Plataforma pueda seguir
 * multiplicando su propia mezcla de hold/surge/chapterFade sin que ninguna
 * escena pierda control sobre su opacidad (Inicio la deja en 1 y no cambia
 * de comportamiento).
 */
export const starGlowFragmentShader = /* glsl */ `
  uniform float uOpacity;
  varying float vPulse;
  varying vec3 vColor;
  varying float vFlare;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float distance = length(point) * 2.0;
    if (distance > 1.0) discard;

    vec3 tint = mix(vec3(1.0), vColor, smoothstep(0.02, 0.22, distance));
    tint = mix(tint, vColor * 0.16, smoothstep(0.22, 0.54, distance));
    float glow = pow(1.0 - distance, 2.4);

    float horizontal = exp(-abs(point.y) * 44.0) * smoothstep(0.5, 0.05, abs(point.x));
    float vertical = exp(-abs(point.x) * 44.0) * smoothstep(0.5, 0.05, abs(point.y));
    float alpha = (glow + (horizontal + vertical) * 0.3 * vFlare) * vPulse * uOpacity;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(tint * (0.68 + vPulse * 0.82), alpha);
  }
`

/**
 * Vertex shader de las nubes orbitales de Plataforma.
 *
 * Cada partícula gira en torno al eje Y del núcleo (no al eje de pantalla
 * como en Inicio, que es un telón lejano) a una velocidad propia según su
 * radio — el mismo "giro diferencial" que hace que el cielo de Inicio se lea
 * como espiral y no como papel pintado, aquí aplicado a la nube que rodea el
 * cubo. `aY`/`aZJitter` guardan lo que antes horneaba `cloud()` en la propia
 * posición (la banda vertical de las costuras, el ruido en Z); sólo el giro
 * en XZ pasa a vivir en el shader.
 */
export const orbitalStarVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uZCenter;
  attribute float aRadius;
  attribute float aAngle;
  attribute float aSpeed;
  attribute float aY;
  attribute float aZJitter;
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aColor;
  varying float vPulse;
  varying vec3 vColor;
  varying float vFlare;

  void main() {
    float angle = aAngle + uTime * aSpeed;
    vec3 orbited = vec3(cos(angle) * aRadius, aY, uZCenter + sin(angle) * aRadius + aZJitter);
    vec4 viewPosition = modelViewMatrix * vec4(orbited, 1.0);
    float fastPulse = sin(uTime * (1.15 + aPhase * 0.9) + aPhase * 31.4159);
    float slowPulse = sin(uTime * 0.31 + aPhase * 13.7);
    vPulse = clamp(0.62 + fastPulse * 0.25 + slowPulse * 0.13, 0.18, 1.0);
    vColor = aColor;
    // Las puntas sólo las llevan las grandes; en un punto de tres píxeles
    // serían una cruz de aliasing (igual que en Inicio).
    vFlare = smoothstep(3.4, 6.4, aSize);
    gl_PointSize = aSize * (uScale / max(-viewPosition.z, 0.001)) * (0.76 + vPulse * 0.46);
    gl_Position = projectionMatrix * viewPosition;
  }
`

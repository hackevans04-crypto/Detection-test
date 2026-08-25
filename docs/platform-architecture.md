# Capítulo 02 · Plataforma

## Arquitectura continua

Inicio y Plataforma viven en el mismo `Canvas`, usan una sola `PerspectiveCamera`, un solo reloj y una sola línea de tiempo fijada. Plataforma comienza en `masterTime=0.90`, de modo que comparte el 10 % final de Inicio. No existe `unpin`, salto de hash, reinicio de FOV, exposición o progreso.

El primer keyframe de Plataforma coincide exactamente con `HeroShot END`: posición `[0,-1.05,-1.4]`, target `[0,-1.18,-3]`, FOV `39.2` y roll `0`.

## Camera map

| Progreso | Beat | Intención |
| --- | --- | --- |
| 0.00–0.10 | Handoff | Continúa dentro del portal sin cambiar la lente. |
| 0.10–0.20 | Reveal | Revela base, cubo cerrado y profundidad lateral. |
| 0.20–0.39 | Orbit / ascenso | Arco de tres cuartos y lectura superior del sistema. |
| 0.39–0.57 | Apertura | Los seis paneles del cubo se separan de forma dirigida. |
| 0.57–0.73 | Paso / núcleo | Cruza el hueco y se aproxima al reactor sin entrar en geometría. |
| 0.73–0.88 | Conceptos | Target estable y velocidad reducida para lectura. |
| 0.88–0.96 | Reensamble | Las mismas seis piezas recuperan su transformación original. |
| 0.96–1.00 | Salida | El túnel de datos prepara la entrada física a Proceso. |

La verificación muestrea 4.001 puntos del riel y las cajas orientadas de cada panel. Resultado actual: clearance mínimo `0.107 u`, ocupación máxima estimada `90.9 %`, roll máximo `2.98°`, sin error al invertir progreso.

## Despiece coherente

El protagonista es un único cubo. Su carcasa se compone de `PanelSuperior`, `PanelInferior`, `PanelFrontal`, `PanelPosterior`, `PanelIzquierdo` y `PanelDerecho`. Esas mismas piezas cubren ASSEMBLED → PARTIAL_OPEN → EXPLODED → REASSEMBLED. El GLB del cubo se conserva reducido como chasis interno, visible al abrir; nunca sustituye a la carcasa.

La escena usa dos anillos funcionales, no tres anillos gigantes. El túnel sólo se dibuja en entrada y salida.

## Auditoría de los 15 GLB entregados

Todos los originales comparten una limitación estructural: una sola malla, un material, dos texturas de `8192×8192`, aproximadamente `1.97 M` triángulos y ningún despiece animable. Por eso los cuatro elegidos se derivan y optimizan; ninguno entra directamente al navegador.

| # | Asset (sufijo) | MB | Triángulos | Dimensiones normalizadas | Decisión | Fase visible / función |
| --- | --- | ---: | ---: | --- | --- | --- |
| 1 | Untitled `003633` | 62.27 | 1,969,964 | .87×1×.86 | REMOVE | Cubo alternativo redundante. |
| 2 | Untitled `002829` | 63.57 | 1,983,550 | .43×.40×1 | REMOVE | Portal circular redundante. |
| 3 | Núcleo de Datos AI `002203` | 63.02 | 1,971,720 | 1×.86×.41 | REMOVE | Explosión ornamental; no conserva el cubo. |
| 4 | Untitled `002145` | 62.49 | 1,969,162 | .96×1×.94 | REMOVE | Portal alternativo sin función adicional. |
| 5 | Túnel de Datos `001814` | 62.19 | 1,974,964 | .61×.62×1 | DERIVE / KEEP | Entrada 0–.09 y salida .91–1. |
| 6 | Untitled `001045` | 61.56 | 1,973,982 | 1×.77×.73 | REMOVE | Reactor con piezas redundante. |
| 7 | Untitled `000750` | 64.29 | 1,977,412 | 1×.66×.91 | REMOVE | Plataforma alternativa redundante. |
| 8 | Untitled `000131` | 63.20 | 1,977,710 | 1×.66×.78 | REMOVE | Plataforma alternativa redundante. |
| 9 | Untitled `235815` | 63.74 | 1,974,412 | 1×.78×.71 | REMOVE | Núcleo con órbitas; demasiados actores unidos. |
| 10 | Núcleo Técnico `234637` | 61.93 | 1,968,962 | 1×.79×.98 | REMOVE | Reactor alternativo redundante. |
| 11 | Untitled `210756` | 63.32 | 1,972,888 | 1×.78×.81 | REMOVE | Reactor alternativo redundante. |
| 12 | Núcleo de Energía `205907` | 61.40 | 1,971,134 | 1×.79×.89 | DERIVE / KEEP | Reactor interno .34–.91. |
| 13 | Cubo Cibernético `204446` | 63.27 | 1,973,456 | 1×.86×.58 | REBUILD REF | Referencia de explosión; malla monolítica. |
| 14 | Cubo Sci-Fi `202444` | 64.41 | 1,971,160 | .97×.93×1 | DERIVE + REBUILD | Chasis interno; carcasa rehecha en seis paneles. |
| 15 | Plataforma Teletransporte `202433` | 61.31 | 1,977,830 | .88×.46×1 | DERIVE / KEEP | Base mecánica .08–.98. |

Derivados de producción: `mechanical-base.glb` 0.67 MB / ~49k tris; `modular-cube.glb` 0.87 MB / ~55k; `energy-core.glb` 0.70 MB / ~43k; `data-tunnel.glb` 0.54 MB / ~35k. Total aproximado: 2.78 MB y 182k tris antes de geometría procedural, dentro del presupuesto HIGH.

La hoja de siluetas está en `tmp/silhouettes/platform-assets-contact-sheet.png`. Los PNG conceptuales entregados no se usan como actores finales.

## Texto y datos

Los cuatro conceptos aparecen uno por uno y están anclados al mundo: nodo → conector → señal → título → descripción → disolución. No se renderizan KPIs, porcentajes, usuarios, precisión de IA ni datos demo.

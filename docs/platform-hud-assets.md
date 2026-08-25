# Kit holografico del capitulo 02

## Donde

```text
public/detection-home/platform/hud/
```

La carpeta ya existe. El capitulo lee de ahi y no hay que tocar codigo: cuando
un archivo aparece con su nombre exacto, su glifo se enciende. Mientras no este,
ese glifo no se dibuja y el resto del capitulo funciona igual.

## Archivos

Cuatro, uno por concepto. Los nombres son exactos, en minusculas y sin tildes:

| Archivo | Concepto | Del kit | Ventana en el capitulo |
|---|---|---|---|
| `glyph-evaluacion.png` | Evaluacion | lamina 2 - Check / Validation | 0.55 - 0.66 |
| `glyph-organizacion.png` | Organizacion | lamina 3 - Structure / Network | 0.63 - 0.72 |
| `glyph-analisis.png` | Analisis | lamina 4 - Graphs / Data | 0.69 - 0.79 |
| `glyph-inclusion.png` | Inclusion | lamina 5 - People / Network | 0.77 - 0.88 |

El contrato vive en [`lib/platform/hud.ts`](../lib/platform/hud.ts); las ventanas
salen de `CONCEPTS` en [`lib/platform/timeline.ts`](../lib/platform/timeline.ts).

## Exportacion

- PNG con alfa real. El fondo debe ser transparente.
- Formato cuadrado, idealmente 512x512 o 1024x1024.
- Solo el icono: sin texto quemado, sin marco y sin fondo de estrellas.
- Neon sobre transparente, usando la paleta del sitio: cian `#00D9FF`, azul
  `#0879F9` y acento naranja.

## El resto del kit

Las otras laminas del kit no se integran en este componente, a proposito:

- Portal y cubo ya existen como modelos 3D reales: `data-tunnel.glb`,
  `modular-cube.glb`, `energy-core.glb` y `mechanical-base.glb`.
- Las composiciones completas traen fondo, perspectiva y texto propios; encima
  de la escena 3D competirian con la lectura del capitulo.
- Particulas, niebla y anillos ya son geometria viva en la escena, reaccionando
  al progreso y al puntero.

Si despues se quiere usar alguna lamina completa, el sitio natural no es este
capitulo 3D sino una seccion plana de la pagina, como Proceso o Tecnologia.

## Comprobado

Con la carpeta vacia: el capitulo renderiza igual y sin errores de consola. El
archivo se comprueba con una peticion previa antes de pedirlo como textura.

Con los cuatro archivos puestos: cada glifo entra con la ventana de su concepto,
crece con un rebote corto, respira y lo cruza un anillo de escaneo.

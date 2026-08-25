export type ModuleSpec = {
  name: string
  assembled: [number, number, number]
  size: [number, number, number]
  exploded: [number, number, number]
  rotation: [number, number, number]
  delay: number
}

/*
  Cómo se abre el cubo.

  Antes se partía en seis caras y se separaban hasta 3,7 u. Dos problemas
  medidos en captura:

  1. **Las piezas salían rotas.** La malla del GLB es una sola cáscara cerrada y
     se repartía triángulo a triángulo según a qué cara «miraba» cada centroide.
     Esa frontera es diagonal, así que cortaba los relieves del modelo en zigzag:
     al separarse, cada panel enseñaba un borde dentado y su interior hueco. Eso
     es lo que se veía como geometría deformada, y no venía del archivo —los
     cuatro modelos tienen escala uniforme y una única malla limpia.

  2. **No coincidía con el modelo.** El cubo está diseñado en tres bandas
     horizontales —se leen en su propia textura—, así que cortarlo por las
     diagonales iba contra su dibujo.

  Ahora se corta por donde el modelo ya está dividido: dos planos horizontales.
  Las separaciones salen del encuadre: con la cámara a 7,8 u y 43° de campo
  caben 6 u de alto, y el cubo abierto mide 4,9. El corte es recto, la costura
  queda oculta entre bandas y cada pieza sigue
  siendo un trozo entero del modelo. La banda central se aparta hacia un lado y
  abre la ventana por la que se ve el núcleo; la de arriba sube y la de abajo
  baja, de modo que la apertura se lee de un vistazo.
*/

/** Cortes en altura normalizada del modelo (−1 abajo, +1 arriba). */
export const LAYER_CUTS = [-0.34, 0.34] as const

export const PLATFORM_MODULES: readonly ModuleSpec[] = [
  { name: 'CapaSuperior', assembled: [0, 1.0, -9], size: [3.05, 1.0, 3.05], exploded: [0.1, 1.05, -0.14], rotation: [0.02, 0.1, 0.014], delay: 0 },
  { name: 'CapaMedia', assembled: [0, 0, -9], size: [3.05, 1.0, 3.05], exploded: [1.42, 0.06, 0.82], rotation: [-0.012, -0.075, -0.01], delay: 0.22 },
  { name: 'CapaInferior', assembled: [0, -1.0, -9], size: [3.05, 1.0, 3.05], exploded: [-0.08, -0.92, 0.12], rotation: [0.016, 0.085, -0.012], delay: 0.4 },
] as const

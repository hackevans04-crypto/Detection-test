# QA de hardware — rueda adaptativa del Hero

Lo sintético ya está medido y pasa. Lo que **no** se puede medir desde un arnés
es el hardware real: `page.mouse.wheel` va por CDP y entrega huecos de 208–391 ms
aunque se le pidan 30, así que nunca reproduce un arrastre rápido de verdad.
Esta tabla es para rellenar con un ratón y un trackpad reales.

## Cómo medir

1. Abrir `http://localhost:3000/?heroDebug=1`.
2. En el panel, bloque **Rueda adaptativa**: `multiplicador`, `pico`, `impulso`,
   `desde el último`, `delta … → … px` (marca `(techo)` si se recortó).
3. Desde la consola, `heroWheel` da los mismos valores en vivo.

## Tabla

| Dispositivo | Modo | Gestos hasta el final | Gestos dentro de un concepto | Pico multiplicador | Caída a 1x | Reverse | ¿Pastosa? | ¿Demasiado rápida? |
|---|---|---|---|---|---|---|---|---|
| ratón | lento | | | | | | | |
| ratón | medio | | | | | | | |
| ratón | rápido continuo | | | | | | | |
| trackpad | swipe corto | | | | | | | |
| trackpad | swipe medio | | | | | | | |
| trackpad | swipe largo | | | | | | | |
| trackpad | reverse inmediato | | | | | | | |

## Referencia ya medida con eventos confiables

Medido en producción con `Input.dispatchMouseEvent` por CDP crudo: eventos
`isTrusted`, con huecos reales de 23–105 ms. No es hardware, pero es lo más
cerca que llega un arnés. Chromium fusiona y encola eventos igual que con una
rueda real, así que las cifras de abajo ya incluyen ese efecto.

### Rueda

| Modo | Muescas hasta el final | Pico | Caída a 1x |
|---|---|---|---|
| lento | ~53 | 4.00x | 711 ms |
| medio | ~33 | 4.00x | 959 ms |
| rápido continuo | ~30 | 4.00x | ver nota |

Con rueda sintética y hueco controlado: arrastre 28–31, giro medio 47–57,
ritmo de lectura 83 (sin cambio respecto al original). El giro medio cae justo
en el punto de equilibrio del impulso, así que varía con el hueco real: 285 ms
dan 47 muescas y 309 ms dan 57.

### Trackpad (deltas de 15 px)

| Gesto | Pico | Recorrido | Delta máx | Velocidad máx | Inercia |
|---|---|---|---|---|---|
| swipe corto | 1.01x | 1.5 % | 31 px | 35 px/frame | 0 ms |
| swipe medio | 1.32x | 6.2 % | 59 px | 80 px/frame | 0 ms |
| swipe largo | 2.99x | 20.5 % | 92 px | 146 px/frame | 1380 ms |

Ningún gesto se acerca al techo de 314 px: **sin saltos**. La velocidad crece
proporcional al gesto: **sin explosiones**. La cola de 1380 ms del swipe largo
es el amortiguado de Lenis, y sólo aparece en el gesto más largo.

### Reverse

Desde pico 4.00x, parada de 100 ms y gesto contrario: multiplicador 1.00x y el
progreso baja de inmediato (−0.76 %). Con trackpad y reverse sin pausa: 1.04x
y −1.46 %.

### Por qué el reverse recoge el objetivo pendiente

Medido el exceso que Lenis aún debe a la posición visible tras dejar de girar:

| Tiempo desde el último evento | Exceso pendiente |
|---|---|
| 50 ms | 305 px (73 % de una meseta) |
| 100 ms | 305 px (73 % de una meseta) |
| 200 ms | 7 px |

A los 100 ms —el instante exacto que fija la prueba de reverse— el exceso sigue
entero, porque durante un recorrido rápido la escena va a ~28 fps y en 100 ms
apenas caben tres fotogramas. De ahí que invertir el sentido recoja también el
objetivo pendiente y no sólo el impulso. A partir de 200 ms es un no-op.

## Nota sobre las medidas de tiempo

Las caídas a 1x medidas en reloj de pared están infladas por bloqueos del hilo
principal: en un recorrido rápido el frame time mediano es 35.9 ms (28 fps),
p90 359 ms y hasta 1255 ms de pico. El modelo en sí es exacto —el impulso cae
`Δt / 1150`, verificado— pero el reloj del arnés no lo es. Si el panel muestra
huecos altos en `desde el último` sin que hayas parado, es esto.

## Qué debería fallar si algo va mal

- **Pastosa**: el multiplicador no sube de ~1.5x arrastrando → el impulso no
  acumula; mirar `desde el último` (huecos altos = el hilo principal se bloquea).
- **Descontrolada**: `(techo)` nunca aparece con un gesto brusco → el clamp no
  está recibiendo `chapterPx`.
- **Salta conceptos**: un solo evento con delta efectivo > 314 px.
- **Reverse tardío**: tras invertir, `multiplicador` no baja a ~1.00x.

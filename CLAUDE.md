# Sandbox 3D (nombre provisional)

Sitio web: un diorama 3D vivo que flota en el vacío. El usuario esculpe terreno, hace llover, abre ríos, provoca erupciones y meteoros, y ve crecer y arder la vida. Sin objetivos ni puntuación: el placer es jugar y mirar. Estética gelatinosa estilo iOS (translucidez, brillo, rebote con resortes). Solo para PC de gama media-alta y alta.

El plan completo está en `docs/plan.md`. Léelo antes de empezar cualquier fase.

## Decisiones tomadas (todas las recomendadas, salvo que se cambie aquí)

| Nº | Decisión | Elección |
|----|----------|----------|
| 1 | Nombre | Nombre de trabajo "Sandbox 3D"; se decide al final |
| 2 | Forma del diorama | Bloque flotante de esquinas redondeadas |
| 3 | Estilo visual | Gelatina suave estilo iOS |
| 4 | Wobble | Resorte y gelatina en todo (terreno, plantas, agua, cámara, interfaz) |
| 5 | Color | Abierto: los materiales usan un color base como parámetro; colores de trabajo neutros por ahora |
| 6 | Tecnología 3D | Three.js + TypeScript + Vite |
| 7 | Renderizado | WebGPU con respaldo automático a WebGL2 |
| 8 | Agua | Mapa de alturas de agua + partículas de salpicadura y espuma. **Fase 2 arranca en CPU** (tuberías virtuales, rejilla de agua máx. 128², mismo diseño de datos, chunks dormidos); el paso a GPU (compute) queda en `docs/backlog.md` |
| 9 | Física | Rapier (WebAssembly) |
| 10 | Interfaz | HTML/CSS + TypeScript, vidrio translúcido estilo iOS, resortes |
| 11 | Equipo objetivo | PC media-alta y alta; niveles **Bajo (por defecto), Medio, Alto, Ultra**; aviso claro en celular. Bajo se agregó tras la primera prueba en la PC del usuario (~55 FPS con un cubo): hay que cuidar equipos modestos |
| 12 | Guardado | Sin servidor: IndexedDB + exportar/importar archivo |
| 13 | Multijugador | No, por ahora |
| 14 | Idioma | Inglés primero, con iconos claros |
| 15 | Sonido | "Pop"/"boing" suaves + ambiente (lluvia, viento, trueno) |
| 16 | Alojamiento | Cloudflare Pages, despliegue desde GitHub |

## Principios de diseño

- Wow en 5 segundos. Una acción, una reacción bonita.
- Pocas herramientas, muy pulidas.
- Fluidez primero: 60 a 144 FPS.
- Materiales y luz son los protagonistas; el color se decide después.
- Todo rebota con gracia con el mismo lenguaje de resortes.
- Se crece por capas: terreno, agua, clima, desastres, vida.

## Reglas técnicas (obligatorias)

1. La simulación corre con **paso de tiempo fijo**, independiente de los FPS, con interpolación al dibujar.
2. Objetos repetidos (árboles, hierba, partículas) con **instancing**.
3. Lo pesado va a la **GPU** (compute shaders) y no se lee de vuelta en la CPU.
4. Los shaders se compilan/calientan durante la carga.
5. No crear objetos/listas nuevas en cada cuadro (evitar basura del GC).
6. Tareas largas (guardar, generar terreno) en Web Workers.
7. Animar la interfaz con transform/opacity, no con tamaño ni posición.
8. Rigidez, amortiguación y masa de los resortes viven en un archivo de configuración, no en el código.
9. El color base de cada material es un parámetro; no hardcodear paletas.
10. Ajustes de usuario: "Intensidad del wobble" (0 a 100), "Reducir movimiento", "Intensidad de brillo".

## Presupuesto de tiempo por cuadro (60 FPS = 16,6 ms)

Lógica e interfaz (CPU) 3,0 ms · Simulación (GPU) 4,0 ms · Dibujo de la escena 6,0 ms · Post-procesado 2,0 ms · Margen 1,6 ms.

## Niveles de calidad (metas de diseño, se validan midiendo)

| | Bajo (defecto) | Medio | Alto | Ultra |
|---|---|---|---|---|
| FPS | 30 a 60 estables | 60 | 60 a 120 | 120 a 144 |
| Mundo | 128x128 | 256x256 | 512x512 | 1024x1024 |
| Plantas | ~15 000 | ~50 000 | ~150 000 | ~300 000 |
| Partículas | ~30 000 | ~100 000 | ~300 000 | 500 000+ |
| Texturas | 512 a 1K | 1K | 2K | 2K a 4K |
| Sombras / blur de interfaz | No / No | Sí / No | Sí / Sí | Sí / Sí |

Calidad adaptable (`src/perf/adaptive.ts`): si el tiempo por cuadro supera ~22 ms baja la resolución interna (hasta 50 %) y la sube despacio cuando hay margen. Nada debe congelar la pantalla: el trabajo pesado (generar o remuestrear el mundo) se reparte en varios cuadros con un presupuesto de milisegundos.

## Estructura del repositorio

```
src/
  core/       bucle principal, renderizador, cámara, calidad dinámica
  world/      cuadrícula, mapa de alturas, materiales, guardado
  sim/        agua, lava, erosión, clima (compute shaders y lógica)
  anim/       resortes, curvas, transiciones, wobble
  tools/      pinceles, desastres, herramientas del dock
  life/       vegetación, fuego, criaturas
  fx/         partículas, post-procesado, luz, sonido
  ui/         dock, ajustes, tutorial, modo foto
  share/      exportar/importar, captura de imagen
  perf/       panel de rendimiento y niveles de calidad
  shaders/    shaders (gelatina, agua, lava, cielo, partículas)
  materials/  biblioteca de materiales, texturas y mapas
public/       audio, iconos, mundos de ejemplo
```

## Fases

0 Preparación · 1 Diorama y terreno esculpible · 2 Agua · 3 Clima y ciclo día/noche · 4 Desastres · 5 Vida · 6 Modo foto y cinemático · 7 Cielo y extras (opcional) · 8 Pulido y lanzamiento.

**Regla de oro:** no empezar la fase siguiente hasta que la actual se vea y se sienta fluida en la PC del usuario. Detalle de tareas y criterios de "listo cuando" en `docs/plan.md`.

## Reglas de trabajo

- No cambiar la arquitectura ni las decisiones de este archivo sin avisar.
- Una tarea por sesión, con criterios verificables; commits pequeños y un resumen de qué cambió y cómo probarlo.
- Tocar solo el alcance pedido. Ideas nuevas van a `docs/backlog.md` (lista de "para después"), no al código.
- Estas sesiones probablemente no tienen GPU potente: entrega código, pruebas de lógica y paneles de medición; el usuario juzga la fluidez y el aspecto en su PC.
- Solo recursos con licencia libre o propios; anotar cada licencia en la página de créditos.
- Estilo de código: TypeScript estricto, módulos pequeños, nombres en inglés en el código; textos de interfaz en inglés.

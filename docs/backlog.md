# Para después

Ideas que no entran en la fase actual. No implementar sin pedirlo.

- Esquinas redondeadas del bloque visto desde arriba (decisión #2); la Fase 1 usa bloque cuadrado.
- Refracción de pantalla leve en la gelatina (Fase 1 usa Fresnel + brillo por grosor).
- Aviso o subida automática de nivel cuando el equipo tenga mucho margen (hoy el usuario elige el nivel).
- Mover los resortes del terreno a la GPU (compute) cuando suba la resolución (rule 3).
- Acoplar vecinos en los resortes para que el wobble se propague como onda.
- Dock con magnificación elástica estilo macOS.
- Detección de celulares con aviso (Fase 8).
- **Ultra (1024²) no cabe en CPU:** medido en el peor caso (todo el terreno moviéndose), el paso de resortes cuesta ~14 ms (128²: 0,3 ms · 256²: 0,7 ms · 512²: 2,5 ms; presupuesto de CPU: 3 ms). Mover los resortes y la actualización de vértices a la GPU (compute) antes de ofrecer Ultra como nivel normal. Hoy aparece como "experimental".
- Relleno inicial de la malla repartido en varios cuadros (hoy es un solo cuadro bajo el aviso "Building world…"; en Ultra puede tardar).
- Ajuste fino de la sensación del wobble (rigidez 90, amortiguación según el deslizador) en la PC del usuario.
- **Agua a GPU (compute) y mayor resolución:** hoy la simulación corre en CPU con rejilla máx. 128² (regla 3 pendiente); subir a 256²+ requiere compute shaders.
- Opción de cascada en los bordes del bloque (hoy los bordes son paredes cerradas).
- Refracción y cáusticas del agua; partículas de espuma en orillas y cascadas.
- Mejorar el color del agua con la profundidad en la pared lateral (corte transversal).
- Clima (Fase 3, aplazado por rentabilidad): nieve, tormenta con relámpagos, viento visible, nubes con sombras, sonidos ambientales. Hecho: hora del día, cielo con sol/luna/estrellas, niebla y lluvia que alimenta el agua.
- Lluvia: salpicaduras/ondas de impacto en el agua y en el suelo; con lluvia fuerte toda la rejilla de agua queda despierta (~1 ms/paso en CPU en Node): pasar el agua a GPU lo resuelve.
- La lluvia deja de añadir agua al llegar a profundidad media 0,3 (bordes cerrados); con cascada en los bordes o evaporación el ciclo sería continuo.
- Iluminación nocturna: estrellas solo se ven mirando al horizonte; añadir brillo de luna/estrellas visibles desde arriba si se quiere.
- Espuma del agua: quitada por pedido del usuario (se veía como píxeles blancos). Si se retoma, hacerla como textura suave o partículas, no por patrón en el shader.
- Sombras proyectadas suaves (si se quieren de vuelta): mapa de sombras con PCF/VSM y radio de desenfoque, solo en Alto/Ultra. Hoy no hay sombras del sol; la profundidad viene de AO horneada en vértices (refresco completo del terreno ~7 ms en CPU en el peor caso; normal al esculpir: unos pocos chunks).
- Vida (Fase 5, aplazado): fuego que se propaga (depende de los desastres), estaciones, criaturas luminosas (luciérnagas/peces/pájaros), balanceo de plantas por viento (hoy no se mueven salvo con el terreno), LOD y cantidad dinámica de plantas según FPS.
- Plantas: el crecimiento corre en CPU por rebanadas (1/30 de las plantas por cuadro); con 150k+ (Alto/Ultra) pasarlo a la GPU. Árboles/hierba distintos por especie y variedad de formas.
- Lluvia fuerte prolongada inunda todo el bloque (paredes cerradas, tope de profundidad media 0,3); considerar evaporación o desagüe para un ciclo continuo.

## Vegetation rework (2026-10-04)
- Grass is now a procedural texture in `materials/jelly.ts` (lawn mottling on green, up-facing ground), no longer instanced geometry. Trade-off: grass no longer grows/withers with moisture. Idea: drive the lawn mask from the wetness field so dry ground looks yellower.
- Trees: matte Lambert material, dark palette plus per-instance tonal variety, placed on a jittered lattice (~400 on Low). `GRASS` kind in `growth.ts` is now unused; remove if grass geometry never returns.
- Tree wind sway not implemented.
- (2026-10-04) Trees back to clustered placement (user preference): ~2400 on Low. Sand and rock got procedural textures in `materials/jelly.ts` (3D noise: grain, ripples, cracks).
- (2026-10-04) Fog is now a 2D screen overlay of drifting cloud wisps (`fx/fog-overlay.ts`), no longer 3D `FogExp2`. Day cycle starts ON by default. Idea: let fog thicken with rain/overcast automatically.
- (2026-10-04) Grass/rock textures made stronger; fog layers cross-fade between two cloud textures (38s/53s) so wisps keep changing shape.

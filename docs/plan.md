# Sandbox 3D: plan de desarrollo (versión 3, 3 de octubre de 2026)

Versión en Markdown del plan de trabajo, para que cualquier sesión la consulte desde el repositorio. Las decisiones vigentes están en `CLAUDE.md`.

## 1. Visión

Un mundo en miniatura que flota en el vacío, como una maqueta. Con el cursor se esculpen montañas y valles, se hace llover, se abren ríos, se provocan erupciones y meteoros, y se ve cómo la vida crece y se quema. Sin objetivos ni puntuación.

Experiencia para PC de gama media-alta y alta, con partículas, shaders y transiciones, y una estética gelatinosa estilo iOS: formas redondeadas, materiales translúcidos y brillantes, movimiento con rebote (wobble). Incluye modo foto y modo cinemático.

### Principios

- Wow en 5 segundos; se entiende sin leer nada.
- Una acción, una reacción bonita (luz, partículas, sonido, movimiento).
- Pocas herramientas, muy pulidas.
- Todo se puede contemplar: la interfaz se oculta y la cámara puede moverse sola.
- Fluidez primero: 60 a 144 FPS.
- Materiales y luz como protagonistas; el color se decide después.
- Todo rebota con el mismo lenguaje de resortes.
- Se crece por capas.

Equipo objetivo orientativo: PC con GPU dedicada de gama media o mejor (clase RTX 3060 / RX 6600 en adelante), 16 GB de RAM y navegador de escritorio actual. Las cifras son metas de diseño, no promesas; se confirman en las fases 0 y 1.

## 2. Decisiones

Ver la tabla en `CLAUDE.md`. Alternativas descartadas por ahora:

- Forma: isla orgánica (B), mini planeta esférico (C).
- Estilo: low-poly pastel (B), realista estilizado (C).
- Wobble: solo interfaz (B), exagerado (C).
- Tecnología: React Three Fiber (B), Babylon.js (C).
- Render: solo WebGL2 (B), solo WebGPU (C).
- Agua: fluido completo SPH/FLIP (B), agua falsa con shaders (C).
- Física: cannon-es (B), sin física real (C).
- Interfaz: Svelte/React (B), interfaz dentro del 3D (C).
- Guardado: servidor con galería (B), enlaces cortos (C).
- Multijugador: en vivo (B), repeticiones (C).

## 3. La experiencia

| Categoría | Herramientas | Fase |
|---|---|---|
| Terreno | Subir, bajar, suavizar, aplanar; pintar material (pasto, arena, roca, nieve); generar mundo nuevo (dado) | 1 |
| Agua | Fuente, lluvia local, drenar, nivel del mar global | 2 |
| Clima y tiempo | Hora del día, lluvia, nieve, viento, tormenta con rayos, niebla | 3 |
| Desastres | Meteoro, terremoto, volcán y lava, tornado, inundación, botón de caos | 4 |
| Vida | Semillas, bosques, flores, fuego, criaturas luminosas, estaciones | 5 |
| Cámara | Modo foto, modo cinemático, cámara libre | 6 |
| Cielo (extra) | Lunas, auroras, estrellas fugaces, eclipses | 7 |
| Civilización (opcional) | Aldeas con luces nocturnas que sufren los desastres | 7 |

### Controles

- Clic izquierdo usa la herramienta; clic derecho o botón central mueve la cámara; rueda = zoom; Mayús = precisión.
- Atajos numéricos para herramientas, espacio = pausa, F = modo foto, H = ocultar interfaz.
- Siempre visibles: ocultar interfaz, deshacer, captura.
- Pantallas táctiles y tabletas: opcional, no prioridad.

### Momentos "wow" diseñados

- La primera montaña: sube suave, se pasa un poco, rebota y se asienta como gelatina.
- El primer río: baja por la montaña, encuentra el valle y llena un lago con ondas.
- El primer amanecer: el cielo cambia gradualmente y las sombras se alargan.
- El primer meteoro: la cámara tiembla, el terreno se sacude y queda el cráter.
- El bosque que vuelve a crecer tras el fuego, cada árbol con rebote elástico.

## 4. Materiales, shaders y luz

Concepto: un mundo de gelatina y vidrio. El color base de cada material es un parámetro (el color queda abierto). Brillos controlados, sin negros ni blancos puros, con ajuste "Intensidad de brillo".

### Materiales

| Material | Aspecto | Técnicas |
|---|---|---|
| Gelatina (bloque, montañas) | Suave, translúcida, brillo de borde, resplandor interior | Fresnel y rim light; translucidez falsa por grosor; refracción leve; normal map suave; especular amplio |
| Vidrio esmerilado (interfaz) | Paneles translúcidos con fondo desenfocado | Blur CSS, grano fino, borde 1 px con degradado, sombra suave |
| Agua | Transparente, profunda, orillas con espuma | Absorción por profundidad, refracción, normales animadas, reflejo del cielo, espuma por profundidad/velocidad, cáusticas opcionales |
| Lava | Emisiva, cambia con la temperatura | Emisión con ruido animado, bloom con umbral, enfriamiento a roca |
| Roca y tierra | Detalle fino y capas visibles en los bordes | Normal y rugosidad, mezcla por pendiente y altura, mapeo triplanar |
| Nieve y hielo | Destellos y translucidez leve | Sparkle con ruido fino, especular alto, transmisión simple |
| Plantas y hojas | Dejan pasar la luz y se mecen | Translucidez de hojas, viento y wobble en vértices, instancias |
| Nubes y niebla | Volumen suave | Ruido volumétrico o capas, dispersión simple, niebla por altura |
| Partículas | Chispas, gotas, vapor, luciérnagas con luz propia | Sprites emisivos aditivos, simulación en GPU |

### Texturas

- Mapas por material: color base, normal, rugosidad, oclusión, emisión, altura (empaquetar oclusión/rugosidad/metalicidad).
- Procedurales primero; imágenes donde aporten detalle real.
- Mapeo triplanar en el terreno. Texturas repetibles de 1K a 2K (hasta 4K en Ultra). Compresión KTX2/Basis. Romper repetición mezclando con ruido.

### Translucidez y refracción

- Barata: translucidez falsa por grosor (altura del terreno). Todos los niveles.
- Intermedia: refracción de pantalla (escena opaca a textura, lectura desplazada por la normal).
- Cara: transmisión física de Three.js, solo objetos clave en Ultra.
- Limitar capas translúcidas superpuestas y ordenarlas con cuidado.

### Luz y brillo

- Luz direccional (sol/luna) con sombras suaves y ambiental según la hora.
- IBL generada por el cielo.
- Luces emisivas con presupuesto de luces reales; el resto con halos y bloom.
- Bloom con umbral alto; tone mapping con exposición adaptativa; rim light en objetos principales.
- Rayos volumétricos y destellos de lava, opcionales en Alto y Ultra.

### Movimiento (wobble)

Resorte amortiguado con rigidez, amortiguación y masa. Sobreimpulso inicial de 5 a 15 %.

| Elemento | Movimiento |
|---|---|
| Terreno al esculpir | Cada celda sigue su altura objetivo con un resorte |
| Pincel | Anillo que se estira al moverse y se comprime al frenar |
| Árboles y plantas | Escala elástica al aparecer; balanceo con viento e impactos |
| Agua | Ondas suaves, gotas que rebotan, temblor al caer algo |
| Impactos y terremotos | Onda de choque que hace temblar el terreno y se calma |
| Interfaz | Botones que rebotan, dock con magnificación elástica, paneles con rebote |
| Cámara | Inercia con resorte; rebote leve en límites |
| Transiciones | Curvas suaves; el mundo "brota" al cargar |

### Efectos por nivel de calidad

| Efecto | Medio | Alto | Ultra |
|---|---|---|---|
| Sombras | Básicas | Suaves | Suaves + contacto |
| SSAO | No | Sí | Alta calidad |
| Bloom y viñeta | Sí | Sí | Sí |
| Profundidad de campo | No | Leve | Completa |
| Translucidez gelatina | Falsa por grosor | Falsa + refracción de pantalla | Transmisión real en objetos clave |
| Refracción del agua | Simple | Con profundidad | Con cáusticas |
| Reflejos en el agua | Falsos | SSR | SSR alta calidad |
| Texturas | 1K | 2K | 2K a 4K |
| Anti-aliasing | Básico | TAA | Máximo |
| Nubes | Capas | Volumétricas bajas | Volumétricas altas |
| Partículas | ~100 000 | ~300 000 | 500 000+ |
| Desenfoque de movimiento | No | Opcional | Opcional |

Sonido: "pop" y "boing" sincronizados con rebotes; lluvia, viento y trueno; silenciado hasta el primer toque. Firma visual: brillo gelatinoso del borde del bloque y partículas luminosas al anochecer.

## 5. Componentes y tecnología

| Componente | Qué hace | Fase |
|---|---|---|
| Núcleo | Renderizador, bucle de tiempo fijo, cámara con resortes, calidad dinámica | 0 y 1 |
| Terreno | Malla desde mapa de alturas, actualización por zonas, materiales por altura y pendiente | 1 |
| Resortes (wobble) | Resorte por celda, objetos, interfaz y cámara; parámetros en config | 1 |
| Pinceles y herramientas | Subir, bajar, suavizar, aplanar, deshacer/rehacer | 1 |
| Biblioteca de materiales | Shaders de gelatina, agua, lava, roca, hojas, nubes | 1 a 5 |
| Agua | Simulación en GPU, refracción y espuma, partículas | 2 |
| Cielo y luz | Sol/luna, IBL, sombras, niebla, nubes | 3 |
| Clima | Lluvia, nieve, viento, tormenta | 3 |
| Post-procesado | Bloom, DoF, SSAO, tone mapping, viñeta | 3 |
| Desastres | Meteoro, terremoto, volcán/lava, tornado, inundación | 4 |
| Vegetación y vida | Plantas con instancias, fuego, criaturas | 5 |
| Partículas en GPU | Emisores, energía, mezcla aditiva, colisión con terreno | 2 a 5 |
| Interfaz de vidrio | Dock, paneles, ajustes, tutorial | 1 a 8 |
| Audio | Efectos y ambiente | 3 y 4 |
| Cámara y modo foto | Cinemático, ocultar interfaz, captura | 6 |
| Panel de rendimiento | FPS, tiempo por cuadro, niveles de calidad | 1 |
| Guardado | Guardar y cargar mundos | 6 |

| Área | Elección |
|---|---|
| Lenguaje y build | TypeScript + Vite |
| 3D | Three.js (WebGPU, respaldo WebGL2) |
| Shaders | TSL de Three.js (WGSL/GLSL donde haga falta) |
| Simulación | Compute shaders WebGPU |
| Física | Rapier (WASM) |
| Texturas | KTX2 + Basis |
| Animación | Sistema propio de resortes; librería de resortes o CSS para la interfaz |
| Audio | Howler o Web Audio |
| Interfaz | HTML/CSS con vidrio translúcido |
| Medición | Panel de FPS y tiempo por cuadro (CPU y GPU) |
| Guardado | IndexedDB + archivo exportable |
| Alojamiento | Cloudflare Pages + despliegue desde GitHub |
| Pruebas | Vitest + pruebas de rendimiento en PCs media y alta |

### Representación del mundo

Cuadrícula de 256x256 (Medio), 512x512 (Alto) o 1024x1024 (Ultra), ajustable. Cada celda guarda capas como texturas/buffers: altura del terreno, desplazamiento elástico (posición y velocidad del resorte), altura del agua, lava y temperatura, humedad y vegetación, material (arena, pasto, roca, nieve, ceniza).

## 6. Fases

| Fase | Nombre | Duración | Resultado visible |
|---|---|---|---|
| 0 | Preparación | 1 a 2 días | Cubo 3D publicado en un enlace |
| 1 | Diorama y terreno esculpible | 1 a 1,5 semanas | Esculpes un mundo que rebota como gelatina |
| 2 | Agua | 1,5 a 2 semanas | Ríos y lagos que fluyen |
| 3 | Clima y ciclo día/noche | 1 semana | Amaneceres, lluvia, tormentas |
| 4 | Desastres | 1 a 1,5 semanas | Meteoros, volcanes, terremotos |
| 5 | Vida | 1,5 semanas | Bosques que crecen y se queman |
| 6 | Modo foto y cinemático | 1 semana | Cámara cinemática y captura en alta resolución |
| 7 | Cielo y extras (opcional) | 1 semana | Lunas, auroras, aldeas |
| 8 | Pulido y lanzamiento | 1 a 2 semanas | Versión estable |

**Regla de oro:** no empezar la fase siguiente hasta que la actual se vea y se sienta fluida.

### Fase 0: Preparación

- Repositorio en GitHub (privado), Vite + TypeScript + Three.js.
- Despliegue automático con enlace de vista previa por cambio.
- `CLAUDE.md` con decisiones, estilo de código y reglas.
- Prueba de humo: cubo girando con WebGPU a 60+ FPS con panel de rendimiento visible; comprobar respaldo a WebGL2.
- **Listo cuando:** el enlace público muestra el cubo con el panel de rendimiento y el repo tiene instrucciones para arrancar.

### Fase 1: Diorama y terreno esculpible

- Bloque flotante con bordes que muestran capas de tierra y roca, fondo degradado, niebla suave, luz con sombras suaves.
- Cámara orbital con inercia de resorte y límites.
- Mapa de alturas como malla, actualizando solo la zona editada.
- Pinceles: subir, bajar, suavizar, aplanar, con tamaño y fuerza; anillo visible del pincel.
- Texturas por altura y pendiente (arena, pasto, roca, nieve) con mezcla suave y mapeo triplanar; colores de trabajo.
- Deshacer/rehacer (últimas 20 acciones) y reiniciar con terreno procedural.
- Dock inferior con vidrio translúcido y rebote.
- Resortes del terreno (primer wobble).
- Primer material gelatinoso: Fresnel, translucidez falsa por grosor, brillo de borde, refracción leve.
- Panel de rendimiento (FPS, tiempo por cuadro, 1 % más lento) y selector de calidad.
- **Listo cuando:** esculpir responde en menos de 100 ms, el rebote se siente natural y se mantienen 60+ FPS en PC de gama media.
- Opcional: generador de terrenos con semillas (dado).

### Fase 2: Agua

- Simulación de aguas poco profundas en GPU.
- Herramientas: fuente, lluvia local, drenar, nivel del mar.
- Shader de agua: absorción, refracción, espuma en orillas, reflejo del cielo, normales animadas.
- Estabilidad: límites de velocidad y volumen.
- Bordes: cascada o paredes (decidir).
- Terreno mojado se oscurece. Partículas de salpicadura, gotas y espuma en GPU.
- Primer sistema de calidad dinámica.
- **Listo cuando:** un río nace en la montaña y llega al mar de forma estable durante 5 minutos sin acumular errores.
- Opcional: erosión (tras estabilizar el agua).

### Fase 3: Clima y ciclo día/noche

- Sol y luna con deslizador de hora; cielo con degradado y estrellas; IBL coherente con la hora.
- Lluvia con instancias que alimenta el agua; nieve que se acumula; viento visible; tormenta con relámpagos; niebla; nubes con sombras.
- Post-procesado completo y sonidos ambientales; transiciones suaves.
- **Listo cuando:** cambiar hora y clima en vivo sin caídas de rendimiento y con capturas que se ven bien sin editar.
- Nubes volumétricas con calidad por nivel (recomendado).

### Fase 4: Desastres

- Meteoro (trayectoria, impacto, cráter, onda, escombros, humo); terremoto (sacudida, grietas, deslizamientos); volcán (erupción, lava que fluye y se enfría a roca, vapor con agua); tornado; inundación.
- Shader de lava emisivo. Sistema de efectos reutilizable (partículas, luz, temblor de cámara, sonido). Botón de caos.
- El impacto hace temblar el terreno como gelatina.
- **Listo cuando:** cada desastre deja un cambio permanente y se ve genial en 10 segundos.
- Lava con el mismo método del agua pero más espesa (recomendado).

### Fase 5: Vida

- Vegetación procedural con instancias; crece según humedad, altura y pendiente; estaciones.
- Fuego que se propaga, deja ceniza y rebrota.
- Criaturas luminosas (luciérnagas, peces, pájaros) con bandadas; bioluminiscencia al anochecer.
- Shader de hojas; herramienta de semillas; aparición con escala elástica; presupuesto de objetos y LOD.
- **Listo cuando:** decenas de miles de plantas a 60+ FPS en gama media, cientos de miles en gama alta.
- Criaturas solo luces y partículas (recomendado).

### Fase 6: Modo foto y cinemático

- Botón de cámara que oculta la interfaz; cámara cinemática automática; captura en alta resolución.
- Guardar y cargar mundos (archivo y almacenamiento local); pantalla de inicio con mundos de ejemplo.
- Ajustes: campo de visión, profundidad de campo, velocidad del recorrido.
- **Listo cuando:** en dos toques se activa el cinemático y se captura una imagen en alta resolución.

### Fase 7: Cielo y extras (opcional)

- Lunas, planetas, cometas, auroras, lluvias de estrellas; eclipses; mareas ligeras; aldeas (definir límite claro antes).
- **Listo cuando:** cada extra se activa o apaga sin afectar el rendimiento del resto.

### Fase 8: Pulido y lanzamiento

- Pantalla de carga elegante y tutorial de 20 segundos.
- Optimización de carga y memoria; calentamiento de shaders; prueba de rendimiento para elegir calidad.
- Accesibilidad: reducir movimiento, contraste, opciones para daltónicos.
- Detección de equipo: aviso claro si no hay WebGPU/WebGL2, equipo muy básico o celular.
- README, créditos y licencias; pruebas en varias PCs y navegadores; analítica respetuosa (opcional).
- **Listo cuando:** pasa la lista de verificación (sección 9).

## 7. Rendimiento y fluidez

| Métrica | Medio | Alto | Ultra |
|---|---|---|---|
| Equipo | GPU modesta o integrada | GPU dedicada media o integrada reciente potente | GPU media-alta | GPU de gama alta |
| FPS | 60 | 60 a 120 | 120 a 144 |
| Resolución | 1080p | 1440p | 1440p o 4K con escalado |
| Mundo | 256x256 | 512x512 | 1024x1024 |
| Plantas | ~50 000 | ~150 000 | ~300 000 |
| Partículas | ~100 000 | ~300 000 | 500 000+ |

Presupuesto a 60 FPS (16,6 ms): lógica/interfaz CPU 3,0 · simulación GPU 4,0 · dibujo 6,0 · post-procesado 2,0 · margen 1,6. A 144 Hz el cuadro dura 6,9 ms: en Ultra se logra bajando resolución interna y usando efectos más baratos.

Cómo lograr fluidez:

- Medir primero (FPS, tiempo por cuadro, 1 % más lento) desde la Fase 1.
- Calentar shaders en la carga; evitar basura; lo pesado a la GPU sin leer de vuelta.
- Paso de tiempo fijo con interpolación; Web Workers para tareas largas.
- Calidad dinámica: bajar primero resolución interna y partículas; subir despacio.
- Selector de calidad con prueba corta y límite de FPS para laptops.
- Interfaz barata: animar con transform y opacity.
- Equipos no compatibles: aviso claro con requisitos, no algo roto.

## 8. Trabajo con sesiones en la nube

- Las sesiones solo ven lo que está en GitHub (push).
- Encajan: tareas delimitadas con criterio de "listo" claro, pruebas, refactors, optimización, exportar/importar, interfaz de herramientas.
- Conviene hacerlo en el PC del usuario: afinar la sensación (wobble, velocidad del agua, color, fluidez), elegir colores y sonido, revisar cada resultado.
- Probablemente no hay GPU potente en la nube: pedir código, pruebas de lógica y paneles de medición.
- Flujo: push de la rama; una tarea por sesión; 2 o 3 sesiones en paralelo en zonas distintas; revisar en el PC; fusionar.
- Crédito de sesiones: caduca el 4 de noviembre a las 11:59 PM (hora del Pacífico). Objetivo: fases 0 a 4 en ese plazo.

Plantilla de instrucción:

```
Contexto: proyecto Sandbox 3D (ver CLAUDE.md en la raíz del repo).
Tarea: [una cosa concreta].
Alcance: solo tocar [carpetas]. No cambiar la arquitectura.
Requisitos: 1) ...; 2) integrado con deshacer y rehacer; 3) respeta el presupuesto por cuadro.
Listo cuando: [criterios comprobables].
Entrega: commits pequeños, pruebas donde aplique y resumen de qué cambió y cómo probarlo.
```

## 9. Riesgos y lista de verificación

| Riesgo | Mitigación |
|---|---|
| Agua inestable | Resolución baja al inicio, límites de velocidad, pruebas de 5 a 10 minutos |
| Sin fluidez en gama media | Niveles de calidad, presupuesto por cuadro, panel desde la Fase 1 |
| WebGPU no disponible | Respaldo a WebGL2 y detección de capacidades |
| Wobble o brillos cansan | Controles de intensidad, "Reducir movimiento" |
| Entrada desde celular | Aviso claro con requisitos |
| Alcance que crece | Congelar alcance por fase; lista de "para después" |
| Se ve como otros proyectos | Firma visual propia |
| Contenido ofensivo | Sin galerías públicas hasta tener moderación |
| Licencias | Solo recursos libres o propios; anotar en créditos |

Antes de lanzar:

- El mundo carga y se puede esculpir en menos de 5 s en PC de gama media.
- Fluidez objetivo en Medio, Alto y Ultra sin tirones notorios.
- Funciona en Chrome, Edge, Firefox y Safari de escritorio (Windows, macOS, Linux).
- Visitantes desde celular ven aviso claro.
- No pide registro ni datos personales.
- Nombre, ícono y dominio listos; README y créditos; accesibilidad básica; licencias anotadas.

## 10. Glosario

Mapa de alturas, shader, GPU, WebGL/WebGPU, instancing, bloom, post-procesado, boids, paso de tiempo fijo, calidad dinámica, wobble/resorte, compute shader, SSAO, SSR, TAA, presupuesto por cuadro, Fresnel, translucidez, refracción, emisivo, normal map, mapeo triplanar, IBL, tone mapping, KTX2/Basis. Definiciones en el PDF original del plan.

## Actualización (4 de octubre de 2026): nivel Bajo

Primera prueba en la PC del usuario: un cubo marcó ~55 FPS (1366x613, WebGPU) con un tirón puntual de ~1 s. Se agrega el nivel **Bajo** (mundo 128x128, sin sombras ni blur de interfaz, pixel ratio 1) como nivel por defecto, y calidad adaptable de resolución interna. Ver `CLAUDE.md` para la tabla vigente. Los niveles de la sección 7 se leen como Medio, Alto y Ultra.

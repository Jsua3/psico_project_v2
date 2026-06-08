# PROMPT MAESTRO VISUAL Y TÉCNICO — SIEP 2.5D Pixel-Art

**Proyecto:** SIEP — Sistema de Entrenamiento Psicosocial  
**Tipo de producto:** Juego educativo / simulador psicosocial tipo RPG clínico  
**Estética recomendada:** Pixel-art institucional, serio, humano y profesional  
**Enfoque técnico recomendado:** 2.5D visual sobre motor 2D  
**Motor recomendado:** Phaser 3 integrado en Angular  
**Editor de mapas recomendado:** Tiled  
**Documento:** Especificación completa de dirección visual, escenarios, texturas, personajes, UI y tecnologías

---

## 1. Decisión principal

La recomendación central es desarrollar SIEP como un juego **2.5D visual, pero técnicamente 2D**.

Esto significa que el juego debe **verse con profundidad**, como un RPG pixel-art con perspectiva 3/4, capas, sombras y volumen visual, pero internamente debe seguir funcionando como un juego 2D con:

- mapas en Tiled;
- coordenadas `x` y `y`;
- sprites;
- tilesets;
- colisiones rectangulares;
- profundidad por orden de dibujo;
- puertas entre salas;
- NPCs;
- objetos interactivos;
- HUD;
- diálogos;
- inventario;
- bitácora de reflexión;
- paneles de retroalimentación.

La decisión recomendada es **no pasar a 3D real** en esta etapa.

El 3D real implicaría modelos, cámaras 3D, materiales, luces, rigging, animaciones más complejas, optimización adicional, mayor peso de assets, más deuda técnica y un cambio grande frente a la arquitectura actual. Para SIEP, eso no conviene todavía.

La mejor ruta es vender la ilusión de profundidad sin pagar el costo técnico del 3D. En otras palabras: **que parezca 2.5D, pero que funcione como 2D**.

---

## 2. Veredicto sobre 2D, 2.5D y 3D

| Opción | Recomendación | Motivo |
|---|---|---|
| 2D plano top-down | Aceptable | Es simple y rápido, pero puede verse menos inmersivo. |
| 2.5D pixel-art | **Recomendado** | Se ve más profesional, mantiene el rendimiento y encaja con Phaser + Tiled. |
| 3D real | No recomendado por ahora | Aumenta complejidad, peso, tiempo de producción y deuda técnica. |

La ruta correcta para SIEP es:

```txt
2.5D pixel-art visual
+
Phaser 3 2D
+
Tiled
+
sprites por capas
+
orden de profundidad por coordenada Y
+
escenarios pequeños y bien diseñados
```

---

## 3. Concepto visual general del juego

SIEP debe sentirse como un **RPG institucional de entrenamiento psicosocial**, no como un juego de fantasía, terror o crimen.

El jugador debe explorar escenarios relacionados con la formación en Psicología y atención psicosocial:

- oficinas de orientación;
- aulas;
- salas de espera;
- consultorios;
- comisarías o rutas de protección;
- hospitales o urgencias;
- salas familiares;
- pasillos institucionales;
- salas de supervisión;
- archivos o zonas de recursos.

El tono visual debe ser:

```txt
institucional + calmado + psicológico + profesional + humano
```

El juego trata temas sensibles como VBG, feminicidio, NNA, crisis familiares y rutas de protección. Por eso, la estética debe evitar el morbo, el dramatismo excesivo o la representación gráfica de violencia. La interfaz y los escenarios deben transmitir seguridad, acompañamiento, escucha, ética y aprendizaje.

No se recomienda usar:

- luces rojas dramáticas de “crimen”;
- escenarios oscuros tipo terror;
- sangre;
- símbolos sensacionalistas;
- personajes caricaturizados de forma ofensiva;
- fondos que parezcan videojuegos de persecución o castigo;
- tonos visuales que conviertan el caso en espectáculo.

Sí se recomienda usar:

- luces suaves;
- paleta lavanda, azul, gris, teal y blanco;
- oficinas ordenadas;
- señales institucionales;
- carteles de orientación;
- plantas;
- documentos;
- escritorios;
- tableros;
- computadores;
- sofás;
- sillas de espera;
- puertas con señalética;
- elementos de apoyo clínico y académico.

---

## 4. Qué significa “2.5D” para SIEP

El 2.5D recomendado para SIEP no debe ser 3D real.

Debe ser una ilusión de profundidad lograda con:

1. **Perspectiva 3/4**
   - El jugador ve el escenario desde arriba y ligeramente de frente.
   - Se ven pisos, paredes, escritorios, sillas y personajes con volumen.
   - Los personajes no se ven totalmente desde arriba ni totalmente de frente.

2. **Capas visuales**
   - Piso.
   - Paredes traseras.
   - Objetos detrás del jugador.
   - Personajes.
   - Objetos delante del jugador.
   - Sombras.
   - Luces.
   - UI.

3. **Orden de profundidad por eje Y**
   - Un personaje más abajo en pantalla se dibuja encima de uno que está más arriba.
   - Los objetos pueden tapar parcialmente al jugador si están delante.
   - Esto crea sensación de espacio sin usar 3D.

4. **Sombras falsas**
   - Sombras PNG bajo personajes.
   - Sombras bajo mesas, sillas, plantas y muebles.
   - Sombras suaves cerca de paredes.

5. **Iluminación falsa**
   - Overlays de luz.
   - Conos de luz desde lámparas.
   - Luz suave desde ventanas.
   - Oscurecimiento leve en esquinas.

6. **Objetos con volumen**
   - Muebles con cara superior y cara frontal.
   - Puertas con marco.
   - Archivadores con profundidad.
   - Plantas con sombra.
   - Escritorios con perspectiva.

---

## 5. Dirección de arte recomendada

### 5.1 Estilo

El estilo visual recomendado es:

```txt
pixel-art 2.5D
RPG institucional
perspectiva 3/4
interfaz moderna liquid-glass
paleta lavanda / azul / gris / teal
personajes chibi/proporción semi-realista suave
```

Debe conservar una apariencia pixelada clara, pero sin parecer infantil. El reto está en hacer que el pixel-art se vea académico, limpio y profesional.

### 5.2 Nivel de detalle

El nivel de detalle debe ser medio-alto:

- suficiente detalle para reconocer espacios institucionales;
- suficiente limpieza para que el jugador entienda dónde interactuar;
- evitar saturar la escena con demasiados objetos;
- objetos importantes deben destacar visualmente;
- los escenarios deben ser legibles incluso con zoom 2x o 3x.

### 5.3 Paleta recomendada

Paleta base sugerida:

| Uso | Color aproximado |
|---|---|
| Fondo oscuro UI | `#111827` |
| Paneles oscuros | `#1B2133` |
| Morado principal | `#7C4DFF` |
| Lavanda claro | `#B69CFF` |
| Azul institucional | `#4B7DAF` |
| Teal suave | `#6CC0C7` |
| Gris piso | `#7D8290` |
| Blanco texto | `#F4F7FB` |
| Amarillo alerta ética | `#F5B84B` |
| Rojo estrés moderado | `#E25A4F` |
| Verde adecuado | `#6EC67A` |

La paleta debe priorizar el morado/lavanda como identidad de SIEP, acompañado de azul institucional y grises profesionales.

---

## 6. Texturas recomendadas

En este proyecto no conviene pensar en texturas realistas. Conviene pensar en **tilesets pixel-art** y **sprites por capas**.

### 6.1 Texturas de piso

Los pisos deben construirse con tiles repetibles. Se recomienda crear variaciones para evitar que el mapa se vea plano.

Ejemplos:

```txt
floor_tile_01.png
floor_tile_02.png
floor_tile_crack.png
floor_tile_shadow.png
floor_tile_corner.png
floor_tile_edge.png
floor_tile_dirty_soft.png
floor_tile_highlight.png
```

Tipos de piso recomendados:

- baldosa institucional gris/lavanda;
- piso claro para hospital;
- madera para oficina o sala familiar;
- alfombra para sala de orientación;
- piso oscuro para pasillos administrativos;
- piso de aula en tonos neutros.

Cada tileset de piso debe incluir:

- centro;
- bordes;
- esquinas;
- sombras;
- variaciones decorativas;
- tiles limpios;
- tiles levemente gastados.

### 6.2 Texturas de paredes

Las paredes deben dar sensación de volumen. No deben ser líneas planas.

Cada pared debe incluir:

- pared frontal;
- pared lateral;
- borde superior;
- zócalo;
- sombra en la base;
- esquinas internas;
- esquinas externas;
- variantes con cuadros, señalética o carteles.

Elementos recomendados en paredes:

- carteles de orientación;
- reloj;
- tablero de anuncios;
- diplomas;
- logos institucionales;
- señalización de rutas;
- puertas;
- ventanas;
- persianas;
- pizarras;
- paneles informativos.

### 6.3 Texturas de objetos

Los objetos deben parecer tener volumen. Cada objeto importante debería incluir:

- cara superior;
- cara frontal;
- sombra inferior;
- borde iluminado;
- versión normal;
- versión interactiva/resaltada;
- versión inspeccionada, si aplica.

Objetos principales:

```txt
desk_psychology_office.png
chair_waiting_blue.png
chair_office.png
sofa_blue.png
plant_large.png
plant_small.png
file_cabinet.png
bookshelf.png
whiteboard.png
bulletin_board.png
hospital_bed.png
classroom_desk.png
teacher_desk.png
door_exit.png
computer_desk.png
clipboard.png
document_stack.png
water_dispenser.png
clinical_toolkit.png
route_sign.png
phone_office.png
```

### 6.4 Sombras

Las sombras son esenciales para vender el 2.5D.

Assets recomendados:

```txt
shadow_soft_ellipse.png
shadow_small_character.png
shadow_table.png
shadow_chair.png
shadow_wall_base.png
shadow_door.png
shadow_plant.png
```

Las sombras deben ser suaves, semitransparentes y pixeladas. No deben parecer efectos 3D modernos borrosos que rompan la estética.

### 6.5 Iluminación

La iluminación debe ser falsa, usando overlays 2D.

Assets recomendados:

```txt
light_cone_office.png
light_ceiling_lamp_soft.png
window_light_overlay.png
ambient_vignette_soft.png
screen_glow_blue.png
purple_ui_glow.png
```

Usos:

- lámparas de techo;
- luz de ventana;
- brillo de computador;
- brillo morado para elementos SIEP;
- zonas de foco para NPCs importantes;
- ambiente calmado para oficinas.

No se recomienda iluminación dinámica compleja al inicio. Se puede lograr un resultado muy bueno con PNGs semitransparentes.

---

## 7. Escenarios recomendados

El juego debe organizarse como un conjunto de salas pequeñas y detalladas, conectadas por puertas o por un hub.

No se recomienda crear un mundo abierto grande. Sería más difícil de llenar, más costoso y menos útil para el tipo de simulación clínica.

La estructura recomendada es:

```txt
Portal / Hub institucional
│
├── Oficina de orientación
├── Aula de análisis de caso
├── Sala de espera
├── Consultorio
├── Comisaría / Ruta de protección
├── Hospital / Urgencias
├── Sala familiar
├── Pasillo institucional
├── Sala de supervisión
└── Archivo / Recursos clínicos
```

---

## 8. Escenario: Portal / Hub institucional

### Propósito

Debe funcionar como punto de entrada del jugador al sistema. Desde aquí puede:

- elegir caso;
- ver progreso;
- cambiar personaje;
- abrir bitácora;
- revisar logros;
- acceder a recursos;
- iniciar intento;
- salir de forma segura.

### Elementos visuales

- logo SIEP;
- panel de bienvenida;
- puertas hacia salas/casos;
- tablón de anuncios;
- NPC orientador o docente;
- plantas;
- computadores;
- señalética;
- iluminación morada suave;
- botones liquid-glass integrados.

### Sensación

Debe sentirse como una recepción académica de entrenamiento, no como menú plano.

---

## 9. Escenario: Oficina de orientación

### Propósito

Ideal para:

- entrevista inicial;
- conversación con orientadora;
- escucha activa;
- identificación de señales;
- bitácora de reflexión;
- decisiones clínicas iniciales.

### Elementos visuales

- escritorio;
- computador;
- silla de orientadora;
- silla para usuario;
- sofá;
- mesa auxiliar;
- planta;
- archivador;
- reloj;
- tablero con notas;
- cartel tipo “Escuchar, acompañar, proteger”;
- documentos sobre la mesa.

### Mecánicas sugeridas

- hablar con NPC orientador;
- revisar documento;
- usar herramienta “Observación”;
- abrir bitácora;
- tomar decisión de respuesta;
- activar ruta de protección si corresponde.

---

## 10. Escenario: Aula de análisis

### Propósito

Ideal para:

- introducción académica del caso;
- discusión guiada;
- explicación del objetivo;
- retroalimentación del docente;
- repaso de competencias.

### Elementos visuales

- tablero;
- escritorio docente;
- pupitres;
- proyector;
- carteles institucionales;
- libros;
- NPC docente;
- estudiantes NPC;
- pantalla con resumen del caso.

### Mecánicas sugeridas

- recibir instrucciones;
- abrir recursos;
- consultar teoría;
- responder preguntas formativas;
- revisar rúbrica;
- ver objetivos de aprendizaje.

---

## 11. Escenario: Sala de espera

### Propósito

Ideal para representar momentos previos a la atención. Permite observar contexto y lenguaje no verbal.

### Elementos visuales

- sillas de espera;
- recepción;
- dispensador de agua;
- carteles informativos;
- reloj;
- puerta a consultorio;
- NPCs esperando;
- tablero de turnos.

### Mecánicas sugeridas

- observación contextual;
- diálogo breve con NPC;
- detección de señales;
- selección de herramienta adecuada;
- transición a consultorio.

---

## 12. Escenario: Consultorio

### Propósito

Espacio principal para diálogo sensible y toma de decisiones clínicas.

### Elementos visuales

- escritorio pequeño;
- sillas frente a frente;
- sofá;
- planta;
- archivador;
- caja de pañuelos;
- documentos de consentimiento;
- iluminación cálida;
- puerta de salida segura.

### Mecánicas sugeridas

- diálogo con usuario;
- selección de respuestas;
- medición de estrés;
- validación emocional;
- uso de herramientas clínicas;
- registro en bitácora.

---

## 13. Escenario: Comisaría / Ruta de protección

### Propósito

Representa espacios institucionales donde se orienta sobre rutas, protección y derechos.

### Elementos visuales

- recepción;
- escritorios;
- sillas de espera;
- documentos;
- archivadores;
- señalética de rutas;
- puerta a oficina;
- funcionario NPC;
- cartel de derechos;
- computador.

### Mecánicas sugeridas

- orientar sobre recursos;
- elegir ruta institucional;
- revisar documento;
- evitar respuestas inadecuadas;
- tomar decisión ética;
- registrar evento en intento.

### Nota visual

Debe verse institucional y serio, pero no intimidante. Nada de estética policial agresiva.

---

## 14. Escenario: Hospital / Urgencias

### Propósito

Usado para casos de crisis, atención primaria, riesgo o derivación.

### Elementos visuales

- camilla;
- silla médica;
- escritorio;
- monitor;
- gabinete;
- señalización médica;
- cortina;
- luz blanca suave;
- médico o profesional NPC;
- documentos de atención.

### Mecánicas sugeridas

- valoración de riesgo;
- derivación;
- contención;
- selección de ruta;
- consulta con profesional;
- registro de decisión.

### Nota visual

Debe evitar verse como hospital de terror. Debe sentirse clínico, claro y seguro.

---

## 15. Escenario: Sala familiar

### Propósito

Representa situaciones familiares o contextos de convivencia.

### Elementos visuales

- sala;
- sofá;
- mesa;
- retratos neutros;
- cocina o comedor parcial;
- puerta;
- objetos cotidianos;
- iluminación cálida.

### Mecánicas sugeridas

- observar contexto;
- hablar con familiares;
- identificar factores de riesgo/protección;
- tomar decisiones sobre intervención;
- activar rutas si aplica.

---

## 16. Escenario: Pasillo institucional

### Propósito

Conectar salas. También puede usarse como espacio de transición narrativa.

### Elementos visuales

- puertas;
- señalética;
- lockers;
- plantas;
- carteles;
- luces de techo;
- tablón de anuncios;
- flechas de navegación.

### Mecánicas sugeridas

- moverse entre salas;
- activar puertas EXIT;
- encontrar NPCs;
- consultar mapa;
- entrar a recursos.

---

## 17. Escenario: Sala de supervisión

### Propósito

Espacio para retroalimentación, revisión de decisiones y aprendizaje.

### Elementos visuales

- mesa de reunión;
- tablero;
- pantalla;
- sillas;
- NPC supervisor;
- documentos;
- gráfico de desempeño;
- ambiente académico.

### Mecánicas sugeridas

- recibir feedback;
- revisar decisiones clave;
- comparar desempeño;
- ver competencias;
- desbloquear recomendaciones.

---

## 18. Escenario: Archivo / Recursos clínicos

### Propósito

Lugar donde el jugador consulta herramientas clínicas, documentos, rutas y guías.

### Elementos visuales

- estanterías;
- carpetas;
- archivadores;
- computador;
- documentos;
- etiquetas;
- mesa de consulta.

### Mecánicas sugeridas

- desbloquear herramienta;
- leer ruta;
- obtener documento;
- consultar glosario;
- agregar recurso al inventario.

---

## 19. Personajes

### 19.1 Estilo de personajes

Los personajes deben ser pixel-art 3/4, con cuerpo completo y proporción semi-chibi.

Recomendación de tamaño:

```txt
Personaje base: 48x64 px o 64x80 px
Tile base: 32x32 px o 48x48 px
Zoom recomendado: 2x o 3x
Resolución objetivo: 1280x720 px o superior
```

El personaje debe verse suficientemente grande para distinguir uniforme, pelo y rostro.

### 19.2 Personajes principales

Ejemplos:

| Personaje | Función |
|---|---|
| Estudiante | Avatar controlado por el usuario. |
| Orientadora | NPC guía en casos psicosociales. |
| Docente | NPC académico o supervisor. |
| Usuario/a | Persona que presenta situación de atención. |
| Familiar | NPC contextual. |
| Funcionario | NPC de ruta institucional. |
| Médico/a | NPC de hospital o urgencias. |
| Supervisor/a | Retroalimentación y cierre. |

### 19.3 Uniformes

El editor de personaje debe incluir dos uniformes principales:

1. **Uniforme sin bata**
   - Camisa gris azulada institucional.
   - Pantalón gris azulado.
   - Zapatos blancos o neutros.
   - Logo/insignia del programa de Psicología.
   - Pin o distintivo pequeño.

2. **Uniforme con bata**
   - Uniforme base debajo.
   - Bata blanca encima.
   - Logo institucional en el pecho.
   - Bolsillos.
   - Zapatos blancos o neutros.

### 19.4 Personalización de rostro y cabello

El editor debe permitir personalizar:

- tono de piel;
- forma del rostro;
- ojos;
- cejas;
- nariz;
- boca;
- expresión;
- peinado;
- flequillo;
- largo de cabello;
- color de cabello;
- accesorios discretos;
- uniforme con o sin bata.

La personalización debe ser modular por capas, no dibujando cada combinación manualmente.

---

## 20. Sistema de capas para avatar

El avatar debe construirse por capas superpuestas.

Estructura recomendada:

```txt
body_base.png
skin_tone_overlay.png
face_shape.png
eyes_01.png
eyebrows_01.png
nose_01.png
mouth_smile_01.png
hair_back_01.png
hair_front_01.png
uniform_blue.png
lab_coat.png
shoes_white.png
accessory_pin.png
```

Orden sugerido:

```txt
1. shadow
2. body_base
3. skin
4. uniform
5. lab_coat
6. shoes
7. face
8. hair_back
9. hair_front
10. accessories
```

Esto permite combinar muchos avatares con pocos archivos.

### 20.1 Estados del avatar

El avatar debería tener vistas:

- frontal;
- lateral izquierda;
- lateral derecha;
- posterior.

Y animaciones:

- idle;
- caminar abajo;
- caminar arriba;
- caminar izquierda;
- caminar derecha;
- interactuar;
- hablar;
- recibir feedback;
- escribir en bitácora.

---

## 21. Editor de personaje

### 21.1 Propósito

El editor de personaje permite que el estudiante cree un avatar que represente su identidad profesional dentro del entrenamiento.

### 21.2 Pantalla recomendada

La pantalla debe tener:

- panel izquierdo de personalización;
- avatar grande al centro;
- panel derecho de resumen;
- selección de uniforme;
- vista previa frontal/lateral/posterior;
- botones de guardar, restablecer y continuar.

### 21.3 Secciones del editor

Panel izquierdo:

```txt
Apariencia
├── Rostro
│   ├── Tono de piel
│   ├── Forma del rostro
│   ├── Ojos
│   ├── Cejas
│   ├── Nariz
│   └── Boca / expresión
│
├── Cabello
│   ├── Peinado
│   ├── Flequillo
│   ├── Largo
│   └── Color de cabello
│
└── Accesorios
    ├── Pin
    ├── Gafas discretas
    └── Ninguno
```

Panel derecho:

```txt
Resumen del avatar
├── Vista previa
├── Programa: Psicología
├── Rol: Estudiante
├── Uniforme: Sin bata / Con bata
├── Peinado seleccionado
├── Color de cabello
└── Expresión
```

Panel inferior:

```txt
[Volver] [Guardar personaje] [Restablecer] [Continuar]
```

### 21.4 Reglas del editor

- El jugador puede cambiar el avatar antes de iniciar un caso.
- El avatar debe guardarse en el perfil.
- No debe afectar la evaluación académica.
- Debe evitar opciones ofensivas o poco profesionales.
- Los accesorios deben ser discretos.
- El uniforme debe mantener coherencia institucional.
- La bata debe ser opcional.

---

## 22. Interfaz durante el juego

### 22.1 HUD recomendado

El HUD debe mostrar:

- caso activo;
- etapa actual;
- progreso;
- estrés;
- puntaje;
- objetivo actual;
- herramientas clínicas;
- inventario;
- bitácora;
- minimapa;
- salida segura.

Elementos recomendados:

```txt
Barra superior:
[SIEP] [Caso activo] [Progreso] [Estrés] [Puntaje] [Mapa] [Opciones]

Panel lateral:
Objetivos
Competencias
Decisiones pendientes
Consejo SIEP

Dock inferior:
Herramientas clínicas
Inventario rápido
Bitácora
Salida segura
```

### 22.2 Panel de diálogo

Debe tener:

- retrato del NPC;
- nombre del NPC;
- texto con efecto typewriter;
- opciones de respuesta;
- clasificación visual posterior, no necesariamente antes;
- indicadores de consecuencia;
- botón para continuar.

Las opciones pueden clasificarse internamente como:

```txt
ADEQUATE
RISKY
INADEQUATE
```

Visualmente, después de responder, se puede mostrar:

- verde: respuesta adecuada;
- amarillo: respuesta riesgosa;
- rojo: respuesta inadecuada.

Pero durante la elección, se debe evitar regalar demasiado la respuesta correcta si el objetivo es entrenar criterio.

### 22.3 Bitácora de reflexión

La bitácora debe permitir que el estudiante escriba:

- qué señales identificó;
- qué decisión tomó;
- por qué eligió esa ruta;
- qué aprendió;
- qué haría diferente;
- qué dudas tiene.

La bitácora debe verse como un panel serio y seguro, no como chat informal.

---

## 23. Pantalla de iniciar intento

Antes de iniciar un caso, se recomienda mostrar:

- título del caso;
- escenario;
- duración estimada;
- dificultad;
- competencias trabajadas;
- herramientas recomendadas;
- nota ética;
- botón “Iniciar intento”;
- botón “Ver detalles del caso”;
- selector de avatar/uniforme.

Contenido recomendado:

```txt
Caso seleccionado: Ruta de protección
Escenario: Una persona llega a orientación con señales de riesgo.
Objetivos:
- Aplicar escucha activa.
- Identificar señales de riesgo.
- Orientar sobre rutas de protección.
Herramientas:
- Observación
- Entrevista semiestructurada
- Ficha de riesgo
- Ruta institucional
Nota ética:
Garantizar confidencialidad, consentimiento informado e interés superior cuando aplique.
```

---

## 24. Pantalla de fin de partida

Al finalizar el caso, se recomienda mostrar:

- resultado general;
- puntaje total;
- progreso alcanzado;
- nivel de estrés final;
- tiempo invertido;
- desempeño;
- competencias;
- decisiones clave;
- retroalimentación;
- botones de continuar, reintentar o volver al portal.

Ejemplo:

```txt
¡Simulación completada!

Puntaje total: 1250 pts
Progreso alcanzado: 100%
Estrés final: 28%
Tiempo invertido: 32:47 min
Desempeño: Adecuado

Competencias:
- Observación: Excelente
- Escucha activa: Muy bueno
- Análisis de riesgo: Adecuado
- Decisión ética: Muy bueno

Decisiones clave:
- Identificaste señales de riesgo.
- Validaste emociones.
- Orientaste sobre rutas disponibles.
- Registraste reflexión.

Retroalimentación:
Demostraste una escucha empática y orientaste de forma adecuada. Tu análisis fue pertinente y tus decisiones respetaron los principios éticos.
```

---

## 25. Capas del mapa en Tiled

La estructura recomendada para los mapas es:

```txt
1_floor
2_walls_back
3_props_back
4_collision
5_interactables
6_characters
7_props_front
8_lighting
9_overlay
```

### Descripción de capas

| Capa | Uso |
|---|---|
| `1_floor` | Piso base del escenario. |
| `2_walls_back` | Paredes traseras y laterales. |
| `3_props_back` | Objetos detrás del jugador. |
| `4_collision` | Zonas sólidas invisibles. |
| `5_interactables` | Objetos, NPCs, puertas y herramientas. |
| `6_characters` | Personajes del mapa. |
| `7_props_front` | Objetos que pueden tapar al jugador. |
| `8_lighting` | Luces, sombras, overlays. |
| `9_overlay` | Efectos visuales superiores. |

La clave del 2.5D está en `props_back`, `characters` y `props_front`.

---

## 26. Profundidad por eje Y

Para simular profundidad, los sprites deben ordenarse por su coordenada Y.

Ejemplo en Phaser:

```ts
sprite.setDepth(sprite.y);
```

Para objetos altos:

```ts
objectSprite.setDepth(objectSprite.y + objectDepthOffset);
```

Para objetos frontales:

```ts
frontObject.setDepth(10000);
```

Para UI:

```ts
uiElement.setDepth(50000);
```

Regla:

- si el jugador está más abajo, se ve delante;
- si está más arriba, se ve detrás;
- objetos frontales pueden tapar parcialmente;
- objetos de fondo nunca tapan al jugador.

---

## 27. Configuración técnica de Phaser

Configuración recomendada:

```ts
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  backgroundColor: '#111827',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
};
```

Para evitar pixel-art borroso:

```ts
this.textures.get('avatar').setFilter(Phaser.Textures.FilterMode.NEAREST);
```

Recomendaciones:

- usar `pixelArt: true`;
- usar `roundPixels: true`;
- evitar escalado fraccional;
- usar zoom 2x o 3x;
- exportar assets en tamaños consistentes;
- no mezclar pixel-art con imágenes realistas.

---

## 28. Cámara

La cámara debe seguir al jugador suavemente, pero sin marear.

Recomendaciones:

```ts
this.cameras.main.startFollow(player, true, 0.08, 0.08);
this.cameras.main.setZoom(2);
this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
```

El zoom recomendado:

```txt
2x para mapas medianos
3x para salas pequeñas
1.5x si se necesita más visión general
```

La cámara debe respetar el `cameraZoom` definido en la ambientación del mapa.

---

## 29. Colisiones

Las colisiones deben seguir siendo 2D.

Objetos con colisión:

- paredes;
- escritorios;
- mesas;
- plantas grandes;
- archivadores;
- sillas fijas;
- camas;
- puertas cerradas;
- límites del mapa.

No todo debe tener colisión. Si se bloquea demasiado, el movimiento se siente torpe.

La capa `collision` en Tiled debe contener rectángulos limpios y simples.

---

## 30. Interacciones

Las interacciones deben activarse por cercanía.

Ejemplo:

```txt
Presiona E para interactuar
```

Tipos de interacción:

- hablar con NPC;
- revisar objeto;
- leer documento;
- abrir puerta;
- tomar herramienta;
- registrar bitácora;
- activar ruta;
- consultar recurso;
- iniciar diálogo;
- ver advertencia ética;
- salida segura.

Tipos de objetos:

```txt
PERSON
OBJECT
ROUTE
TOOL
WARNING
EXIT
```

Cada objeto debe tener:

- key;
- tipo;
- posición;
- tamaño;
- prompt de interacción;
- texto;
- icono;
- color;
- decisión asociada si aplica;
- herramienta asociada si aplica;
- metadata para puertas;
- patrón de movimiento si es NPC.

---

## 31. Puertas y salas

Las puertas deben permitir cambiar de sala sin necesariamente cambiar el nodo clínico del DAG.

Ejemplo de metadata para puertas:

```json
{
  "targetNodeKey": "consultorio-orientacion",
  "entryX": 240,
  "entryY": 360
}
```

Regla importante:

- caminar por una puerta cambia de sala;
- tomar una decisión cambia el flujo clínico;
- no toda puerta debe puntuar;
- no toda exploración debe alterar el DAG;
- las decisiones clínicas siguen siendo las que determinan el avance evaluativo.

---

## 32. Mecánicas principales

### 32.1 Exploración

El jugador se mueve por escenarios institucionales.

Acciones:

- caminar;
- observar;
- interactuar;
- entrar a salas;
- hablar con NPCs;
- consultar objetos.

### 32.2 Diálogo

Los diálogos son el centro del entrenamiento.

Características:

- NPC con retrato;
- texto por líneas;
- opciones de respuesta;
- consecuencias;
- variación de estrés/puntaje;
- avance de nodo.

### 32.3 Decisiones éticas

Cada decisión debe clasificarse internamente:

```txt
ADEQUATE
RISKY
INADEQUATE
```

Debe evaluarse:

- si valida emociones;
- si respeta derechos;
- si evita revictimización;
- si orienta correctamente;
- si activa ruta adecuada;
- si protege confidencialidad;
- si reconoce riesgo;
- si no minimiza la situación.

### 32.4 Herramientas clínicas

El jugador puede usar herramientas como:

- Observación;
- Escucha activa;
- Entrevista semiestructurada;
- Ficha de riesgo;
- Ruta institucional;
- Mapa de red de apoyo;
- Diario de reflexión;
- Protocolo de atención.

### 32.5 Bitácora

Debe servir para reflexión del estudiante y evidencia formativa.

### 32.6 Estrés

El estrés representa la presión del caso o la tensión de la interacción. Debe subir o bajar según decisiones.

Ejemplo:

- respuesta empática: baja estrés;
- pregunta invasiva: sube estrés;
- orientación clara: baja estrés;
- omisión de riesgo: sube estrés.

### 32.7 Puntaje

El puntaje no debe sentirse como examen frío, sino como retroalimentación de desempeño.

### 32.8 Salida segura

La salida segura debe estar siempre disponible.

Esto es importante por el tipo de contenido sensible. El estudiante debe poder pausar, cerrar o salir del intento sin sentirse atrapado.

---

## 33. UI liquid-glass + pixel-art

La interfaz debe mezclar:

```txt
pixel-art en escenarios y personajes
+
liquid-glass oscuro en paneles
+
bordes morados brillantes
+
iconografía clara
+
tipografía legible
```

Componentes UI:

- tarjetas;
- paneles laterales;
- HUD superior;
- botones grandes;
- indicadores de progreso;
- barras de estrés;
- inventario;
- bitácora;
- diálogos;
- modal de resultado;
- selector de personaje.

La UI debe tener estética moderna, pero no debe romper el pixel-art. Puede ser más limpia que el escenario, siempre manteniendo bordes, brillos y tonos SIEP.

---

## 34. Estructura recomendada de assets

```txt
assets/game/
  characters/
    base/
    skin/
    face/
    eyes/
    eyebrows/
    nose/
    mouth/
    hair/
    uniforms/
    accessories/
    portraits/

  tilesets/
    institution/
    office/
    classroom/
    hospital/
    police_station/
    home/
    hallway/
    archive/

  props/
    furniture/
    documents/
    plants/
    doors/
    clinical_tools/
    computers/
    signs/
    lights/

  ui/
    icons/
    panels/
    buttons/
    hud/
    dialogue/
    inventory/
    journal/

  lighting/
    shadows/
    overlays/
    lamps/
    window_light/

  maps/
    hub_institutional.json
    office_orientation.json
    classroom_case.json
    waiting_room.json
    consultorio.json
    police_route.json
    hospital_urgency.json
    family_room.json
    hallway.json
    supervision_room.json
    archive_resources.json

  scenarios/
    ruta_proteccion.json
    crisis_familiar.json
    orientacion_escolar.json
```

---

## 35. Convención de nombres

Usar nombres claros y consistentes.

Ejemplos:

```txt
char_student_uniform_blue_front_idle.png
char_student_uniform_blue_walk_down.png
char_student_labcoat_front_idle.png
hair_long_brown_front.png
hair_short_black_back.png
face_eyes_03.png
uniform_psychology_blue.png
uniform_psychology_labcoat.png

tileset_office_floor_48.png
tileset_office_walls_48.png
props_office_furniture_48.png
door_exit_office_01.png
icon_tool_observation.png
icon_tool_active_listening.png
ui_panel_dark_purple.png
```

---

## 36. Tamaños recomendados

| Elemento | Tamaño recomendado |
|---|---|
| Tile base | 32x32 px o 48x48 px |
| Personaje | 48x64 px o 64x80 px |
| Retrato NPC | 96x96 px o 128x128 px |
| Iconos UI | 24x24 px, 32x32 px o 48x48 px |
| Props pequeños | 32x32 px |
| Props medianos | 64x64 px |
| Props grandes | 96x96 px o más |
| Resolución base | 1280x720 px |
| Zoom | 2x o 3x |

Recomendación práctica:

- si se busca más detalle, usar tiles de 48x48;
- si se busca producción más rápida, usar tiles de 32x32;
- no mezclar ambos sin una escala clara.

---

## 37. Tecnologías a utilizar

### 37.1 Frontend

| Tecnología | Uso |
|---|---|
| Angular 21 | Shell de la plataforma, rutas, componentes, paneles y UI general. |
| TypeScript | Lógica del frontend y tipado fuerte. |
| Phaser 3 | Motor del juego 2D/2.5D visual. |
| Tiled | Creación de mapas, capas, colisiones y objetos. |
| Angular Material | Componentes base de UI donde convenga. |
| SCSS | Estilos personalizados, liquid-glass, variables visuales. |
| CSS Variables | Tokens de color `--psy-*` para identidad visual. |
| Angular Signals | Estado reactivo moderno. |
| RxJS | Flujos HTTP, eventos y estado asincrónico. |
| Konva.js | Editor visual de mundo/casos en modo admin. |
| Jest | Pruebas unitarias frontend. |

### 37.2 Backend

| Tecnología | Uso |
|---|---|
| Python 3.12 | Lenguaje backend. |
| Django 5.1 | Framework principal backend. |
| Django REST Framework 3.15 | API REST. |
| PostgreSQL 16 | Base de datos. |
| SimpleJWT | Autenticación JWT. |
| django-cors-headers | CORS para Angular. |
| cryptography / AES-GCM | Cifrado de bitácoras. |
| drf-spectacular | OpenAPI / Swagger. |
| pytest + pytest-django | Pruebas backend. |
| psycopg2-binary | Driver PostgreSQL. |

### 37.3 Herramientas de arte

| Herramienta | Uso |
|---|---|
| Aseprite | Crear pixel-art profesional. |
| LibreSprite | Alternativa libre a Aseprite. |
| Piskel | Alternativa web/simple para sprites. |
| Tiled Map Editor | Construcción de mapas y capas. |
| TexturePacker | Empaquetado de spritesheets, si se requiere. |
| Kenney Assets | Base CC0 para prototipos y tiles. |
| Photoshop / Photopea | Ajustes visuales, overlays, composición. |
| Figma | Diseño de UI, layout, componentes y guías visuales. |

### 37.4 Herramientas de desarrollo

| Herramienta | Uso |
|---|---|
| Node.js + npm | Frontend Angular. |
| Angular CLI | Build, serve y generación de componentes. |
| Docker Desktop | PostgreSQL local y servicios. |
| Git + GitHub | Control de versiones. |
| VS Code / WebStorm | Desarrollo frontend. |
| PyCharm | Desarrollo backend Django. |

---

## 38. Integración con arquitectura existente

El proyecto ya trabaja con Angular, Phaser, Tiled, Django y PostgreSQL. Por eso, la implementación 2.5D debe extender lo existente y no reemplazarlo.

Reglas:

1. Mantener Phaser 3 como runtime del juego.
2. Mantener Tiled JSON como fuente de mapas.
3. Mantener Angular como shell y UI.
4. Mantener Django como backend.
5. No cambiar esquema de base de datos sin discusión previa.
6. Usar `ambient_json` para cámara, zoom, fondo e iluminación.
7. Usar `scene_maps` para mapas.
8. Usar `map_objects` para NPCs, objetos, herramientas, puertas y rutas.
9. Usar `collision_zones` para colisiones.
10. Usar `dialogue_trees`, `dialogue_lines` y `dialogue_choices` para diálogos.
11. Usar `attempt_world_states` para estado de jugador, inventario y sala.
12. Mantener la salida segura siempre disponible.

---

## 39. Datos sugeridos para `ambient_json`

Ejemplo:

```json
{
  "cameraZoom": 2,
  "backgroundImage": "office_orientation_bg",
  "lightingOverlay": "light_cone_office",
  "ambientTone": "calm",
  "musicKey": "ambient_soft_institutional",
  "pixelArtMode": true,
  "depthMode": "y-sort"
}
```

No todos los campos existen necesariamente hoy. Los nuevos campos deben agregarse solo si el contrato lo permite o si se manejan de forma compatible sin romper backend.

---

## 40. Ejemplo de objeto interactivo

```json
{
  "key": "npc_orientadora_01",
  "type": "PERSON",
  "x": 320,
  "y": 240,
  "width": 48,
  "height": 64,
  "icon": "npc",
  "color": "#B69CFF",
  "interactionPrompt": "Hablar con orientadora",
  "interactionText": "La orientadora te recibe y te invita a explicar la situación.",
  "facing": "down",
  "movementPattern": {
    "pattern": "idle",
    "waypoints": []
  }
}
```

---

## 41. Ejemplo de puerta EXIT

```json
{
  "key": "door_to_consultorio",
  "type": "EXIT",
  "x": 640,
  "y": 120,
  "width": 48,
  "height": 64,
  "interactionPrompt": "Entrar al consultorio",
  "metadata": {
    "targetNodeKey": "consultorio-orientacion",
    "entryX": 240,
    "entryY": 360
  }
}
```

---

## 42. Ejemplo de herramienta clínica

```json
{
  "toolCode": "active_listening",
  "label": "Escucha activa",
  "icon": "icon_tool_active_listening",
  "category": "Comunicación",
  "description": "Permite generar confianza, validar emociones y recoger información relevante sin revictimizar."
}
```

---

## 43. Ejemplo de diálogo

```json
{
  "speakerName": "Orientadora",
  "portraitKey": "portrait_orientadora_neutral",
  "emotion": "calm",
  "lines": [
    {
      "displayOrder": 1,
      "text": "Gracias por recibirme. La situación en casa ha sido difícil últimamente..."
    }
  ],
  "choices": [
    {
      "text": "Validar sus emociones y pedirle que cuente más.",
      "classification": "ADEQUATE"
    },
    {
      "text": "Preguntar por hechos concretos con calma.",
      "classification": "RISKY"
    },
    {
      "text": "Minimizar la situación para tranquilizarla.",
      "classification": "INADEQUATE"
    }
  ]
}
```

---

## 44. Sistema visual de feedback

El feedback debe ser claro pero formativo.

Colores:

```txt
Adecuado: verde
Riesgoso: amarillo/naranja
Inadecuado: rojo suave
Información: azul
Ética/advertencia: dorado
SIEP/acción principal: morado
```

El feedback debe explicar por qué una decisión fue adecuada o no.

No basta con decir “correcto” o “incorrecto”.

Ejemplo:

```txt
Elegiste validar la emoción antes de profundizar en los hechos. Esta respuesta ayuda a construir confianza y reduce el riesgo de revictimización.
```

---

## 45. Prompt visual para generar el estilo general

Este prompt puede usarse para crear referencias visuales del juego:

```txt
Diseñar una interfaz de videojuego educativo llamado SIEP, Sistema de Entrenamiento Psicosocial, con estética pixel-art 2.5D, perspectiva 3/4, ambiente institucional universitario y clínico, tonos morado, lavanda, azul y gris oscuro, estilo RPG serio y profesional. Mostrar una oficina de orientación psicosocial con escritorio, orientadora, estudiante, sofá, plantas, tablero de notas, puerta, computador, iluminación suave y panel de diálogo. La interfaz debe incluir HUD con progreso, estrés, puntaje, objetivo actual, inventario, bitácora y salida segura. Debe verse como un simulador educativo de Psicología, humano, ético, calmado, no infantil, no terror, no crimen, no violencia gráfica. Pixel-art detallado, UI liquid-glass oscura con bordes morados brillantes.
```

---

## 46. Prompt visual para editor de personaje

```txt
Diseñar pantalla de editor de personaje para SIEP, videojuego educativo psicosocial en pixel-art 2.5D. La pantalla debe mostrar al centro un avatar estudiante de Psicología en pixel-art 3/4, con uniforme gris azulado institucional. Debe incluir selector de uniforme sin bata y con bata blanca, personalización de rostro, tono de piel, ojos, cejas, nariz, boca, peinado, flequillo y color de cabello. Panel izquierdo con opciones de apariencia, panel derecho con resumen del avatar y vistas frontal, lateral y posterior. Interfaz oscura liquid-glass con bordes morados, estilo profesional universitario, botones Guardar personaje, Restablecer y Continuar. El estilo debe ser pixel-art limpio, serio, humano y académico.
```

---

## 47. Prompt visual para pantalla de iniciar intento

```txt
Diseñar pantalla de iniciar intento para SIEP, simulador psicosocial educativo en pixel-art 2.5D. Mostrar un menú de selección de caso dentro de un hub institucional, con tarjetas de casos como Ruta de Protección, Crisis Familiar y Orientación Escolar. A la derecha mostrar panel de caso seleccionado con escenario, objetivos de aprendizaje, herramientas clínicas recomendadas, nota ética y botón grande Iniciar intento. Estética pixel-art, perspectiva 3/4, UI liquid-glass oscura, bordes morados, íconos clínicos y académicos, tono profesional y calmado.
```

---

## 48. Prompt visual para juego en curso

```txt
Diseñar interfaz durante el juego para SIEP, RPG educativo psicosocial en pixel-art 2.5D. Mostrar una oficina de orientación con perspectiva 3/4, estudiante controlable, orientadora NPC detrás de escritorio, usuario sentado, sofá, archivador, plantas, tablero de notas, reloj y luces suaves. Incluir HUD superior con caso activo, progreso, estrés y puntaje. Panel izquierdo con objetivo actual. Panel derecho con diálogo de NPC y opciones de respuesta. Dock inferior con herramientas clínicas: Observación, Escucha activa, Ficha de riesgo y Ruta institucional. Botón visible de Salida segura. Estilo serio, institucional, profesional, con colores morado, lavanda, azul y gris.
```

---

## 49. Prompt visual para bitácora

```txt
Diseñar panel de bitácora de reflexión para SIEP, videojuego educativo de Psicología en pixel-art 2.5D. La escena de fondo debe mostrar una oficina de orientación oscurecida parcialmente. Encima aparece un panel grande liquid-glass oscuro con título Diario de Reflexión, pregunta guía, caja de texto, contador de caracteres, competencias fortalecidas, línea de eventos clave, consejo SIEP y botones Guardar reflexión y Continuar simulación. Estética profesional, calmada, morada, lavanda y azul, pixel-art institucional.
```

---

## 50. Prompt visual para fin de partida

```txt
Diseñar pantalla de simulación completada para SIEP, sistema de entrenamiento psicosocial en pixel-art 2.5D. Mostrar panel central oscuro liquid-glass con trofeo, título Simulación completada, puntaje total, progreso alcanzado, estrés final, tiempo invertido y desempeño. Mostrar resultados por competencia: Observación, Escucha activa, Análisis de riesgo y Decisión ética. Incluir decisiones clave y retroalimentación del sistema con avatar de orientadora. Botones Ver retroalimentación, Reintentar caso y Volver al portal. Fondo con oficina institucional pixel-art desenfocada u oscurecida. Estilo serio, educativo, profesional y humano.
```

---

## 51. Prompt para desarrollador / Codex

```txt
Actúa como desarrollador senior frontend especializado en Angular 21, Phaser 3 y videojuegos 2D/2.5D con pixel-art. Necesito implementar en SIEP un sistema visual 2.5D manteniendo la arquitectura 2D actual.

Objetivo:
Crear una experiencia de RPG educativo psicosocial con perspectiva 3/4, pixel-art institucional, mapas Tiled, sprites por capas, depth sorting por eje Y, iluminación falsa, HUD liquid-glass, diálogos, herramientas clínicas, bitácora y salida segura.

Restricciones:
- No migrar a 3D real.
- No romper el flujo actual de simulación.
- No modificar esquema de base de datos sin aprobación.
- Mantener Phaser 3 como runtime.
- Mantener Angular como shell.
- Mantener Tiled JSON como mapas.
- Mantener compatibilidad con scene_maps, map_objects, collision_zones, dialogue_trees, dialogue_lines, dialogue_choices y attempt_world_states.
- La salida segura debe estar siempre visible.
- No usar contenido gráfico violento.

Implementar:
1. Configuración Phaser pixelArt, roundPixels y filtro NEAREST.
2. Sistema de depth sorting por coordenada Y para personajes, NPCs y props.
3. Soporte de capas Tiled: floor, walls_back, props_back, collision, interactables, characters, props_front, lighting, overlay.
4. Renderizado de overlays de luz y sombras.
5. Cámara con zoom configurable desde ambient_json.cameraZoom.
6. Interacción por cercanía con tecla E.
7. Puertas EXIT para transición entre salas.
8. HUD con progreso, estrés, puntaje, objetivo, herramientas, inventario, bitácora y salida segura.
9. Panel de diálogo con retrato, texto typewriter y opciones.
10. Editor de personaje por capas: rostro, cabello, uniforme sin bata y con bata.
11. Persistencia del avatar en perfil del usuario.
12. Previsualización frontal, lateral y posterior del avatar.
13. Estilo SCSS liquid-glass con tokens de color SIEP.

Resultado esperado:
El juego debe verse como un RPG pixel-art 2.5D institucional, serio, humano y profesional, sin ser infantil ni sensacionalista.
```

---

## 52. Plan de implementación recomendado

### Fase 1 — Dirección visual base

- Definir paleta final.
- Definir tamaño de tile.
- Definir tamaño de personaje.
- Crear guía visual.
- Crear primer tileset de oficina.
- Crear primer avatar base.
- Crear UI base liquid-glass.

### Fase 2 — Escenario piloto

- Crear mapa `office_orientation.json` en Tiled.
- Separar capas correctamente.
- Agregar colisiones.
- Agregar NPC orientadora.
- Agregar objetos interactivos.
- Agregar puerta EXIT.
- Probar en Phaser.

### Fase 3 — Profundidad 2.5D

- Implementar depth sorting por Y.
- Separar props back/front.
- Agregar sombras.
- Agregar overlays de luz.
- Ajustar cámara y zoom.
- Validar legibilidad.

### Fase 4 — Editor de personaje

- Crear avatar por capas.
- Crear uniformes sin bata y con bata.
- Crear opciones de cabello.
- Crear opciones de rostro.
- Crear pantalla de editor.
- Guardar configuración del avatar.

### Fase 5 — Integración con simulación

- Mostrar avatar personalizado en juego.
- Integrar HUD.
- Integrar diálogos.
- Integrar herramientas.
- Integrar bitácora.
- Integrar feedback.
- Validar salida segura.

### Fase 6 — Escenarios adicionales

- Aula.
- Sala de espera.
- Consultorio.
- Comisaría/ruta.
- Hospital/urgencias.
- Sala familiar.
- Pasillo.
- Sala de supervisión.
- Archivo.

### Fase 7 — Pulido

- Animaciones.
- Sonidos UI.
- Música ambiente.
- Mejoras de accesibilidad.
- Pruebas.
- Optimización.
- Documentación.

---

## 53. Checklist de calidad visual

Antes de aprobar un escenario, revisar:

```txt
[ ] El mapa se entiende a primera vista.
[ ] El jugador sabe dónde puede caminar.
[ ] Los objetos interactivos son reconocibles.
[ ] El personaje no se pierde con el fondo.
[ ] La paleta respeta identidad SIEP.
[ ] No parece terror, crimen ni comedia.
[ ] La escena transmite seguridad y profesionalismo.
[ ] Hay sombras suficientes para profundidad.
[ ] Hay capas frontales y traseras.
[ ] El zoom permite leer la escena.
[ ] El HUD no tapa información crítica.
[ ] La salida segura está visible.
[ ] Los textos son legibles.
[ ] El pixel-art no está borroso.
[ ] No hay mezcla rara entre imágenes realistas y pixel-art.
```

---

## 54. Checklist técnico

```txt
[ ] Phaser está en pixelArt true.
[ ] roundPixels está activo.
[ ] Filtro NEAREST aplicado a texturas.
[ ] Tiled exporta JSON correctamente.
[ ] Capas del mapa tienen nombres consistentes.
[ ] Colisiones funcionan.
[ ] Depth sorting funciona por coordenada Y.
[ ] Cámara sigue al jugador.
[ ] Zoom configurable funciona.
[ ] Interacciones por cercanía funcionan.
[ ] Puertas EXIT funcionan.
[ ] NPCs renderizan correctamente.
[ ] Props frontales tapan al jugador cuando corresponde.
[ ] Props traseros quedan detrás.
[ ] HUD se sincroniza con intento.
[ ] Bitácora guarda correctamente.
[ ] Salida segura funciona.
[ ] Avatar personalizado carga correctamente.
[ ] Build Angular pasa.
[ ] Tests frontend pasan.
[ ] Tests backend pasan.
```

---

## 55. Riesgos y cómo evitarlos

### Riesgo 1: intentar hacer 3D real

Evitarlo. No es necesario para lograr el efecto visual deseado.

### Riesgo 2: pixel-art borroso

Solución:

- `pixelArt: true`;
- `roundPixels: true`;
- filtro `NEAREST`;
- tamaños consistentes;
- no escalar con decimales.

### Riesgo 3: escenarios muy grandes

Solución:

- crear salas pequeñas;
- conectar por puertas;
- priorizar detalle sobre tamaño.

### Riesgo 4: UI demasiado moderna y escenario demasiado retro

Solución:

- usar UI liquid-glass oscura, pero con bordes pixelados y colores SIEP;
- mantener coherencia de iconos;
- evitar gradientes exagerados.

### Riesgo 5: tono inadecuado para temas sensibles

Solución:

- arte calmado;
- no violencia gráfica;
- mensajes éticos;
- salida segura;
- retroalimentación formativa.

### Riesgo 6: demasiadas opciones de avatar

Solución:

- iniciar con pocas opciones bien hechas;
- expandir luego;
- usar sistema por capas.

---

## 56. Recomendación final

La decisión más inteligente para SIEP es:

```txt
Mantener el motor 2D actual
pero elevar la dirección visual a 2.5D pixel-art.
```

El resultado debe ser un juego que se vea como:

```txt
un RPG institucional pixelado,
con salas clínicas explorables,
personajes personalizables,
diálogos serios,
herramientas clínicas,
decisiones éticas,
bitácora reflexiva,
HUD moderno liquid-glass
y retroalimentación formativa.
```

No se debe construir un 3D real por ahora. El proyecto ya tiene una base ideal para crecer con Phaser, Tiled, Angular y Django. Lo correcto es mejorar escenarios, texturas, capas, iluminación, personajes y UI, manteniendo la arquitectura estable.

La meta visual final es que SIEP no parezca un formulario disfrazado de juego, sino una experiencia formativa seria, clara, humana y profesional.

---

## 57. Resumen ejecutivo para el equipo

SIEP debe desarrollarse como un **RPG educativo psicosocial 2.5D en pixel-art**, usando **Phaser 3 + Tiled + Angular + Django**. La experiencia debe mantener la simulación actual, pero mejorar su presentación con perspectiva 3/4, mapas por capas, personajes personalizados, uniformes institucionales, sombras, iluminación falsa, UI liquid-glass y escenarios pequeños pero detallados.

La estrategia correcta es:

1. No migrar a 3D real.
2. Mejorar la ilusión 2.5D.
3. Crear tilesets institucionales.
4. Implementar avatar por capas.
5. Mantener mapas Tiled.
6. Usar depth sorting por eje Y.
7. Diseñar salas clínicas y académicas.
8. Mantener salida segura y tono ético.
9. Usar tecnologías actuales del proyecto.
10. Pulir arte, UI y experiencia de usuario.

SIEP debe verse serio, bonito, claro y profesional. Pixelado sí. Infantil no.

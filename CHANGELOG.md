# Registro de cambios

La versión del programa es la de `package.json` en la raíz. Se sigue el versionado semántico: mayor, menor y parche.

## [1.1.0] — sin publicar (entrega del 18 de noviembre de 2026)

### Lo que nota un estudiante

- Recorre los tres capítulos de un caso con salas, objetos y personajes que se desplazan.
- Los diálogos muestran retratos y decisiones sobre la escena; la cámara y el plano ayudan a orientarse.
- La pausa, la salida segura y la recuperación del avance reciben mejoras ante fallos de conexión.

### Lo que nota un docente

- Puede describir un caso para generarlo por etapas y consultar el avance, los errores y las opciones de reintento.
- Puede revisar y aceptar escenas sugeridas, corregir sus contenidos y ensayar el caso en el juego.

### Interno

- Se incorpora el documento `x-siep` 2.2 y la estructura de salas por piezas, con importación y guardado de su estructura.
- Se añaden las migraciones `simulation.0035_authoring_generations` y `simulation.0036_scene_map_structure`.
- La autoría con IA usa `AI_AUTHORING_ENABLED` y configuración de proveedor; se añade un proveedor compatible con OpenAI y un límite diario global de generaciones.
- Se amplían las pruebas de contratos, generación, salas, diálogos y recorridos del caso.

Rango: `origin/master` `ef9deb4f` … `HEAD` `1380fdd8`; 389 commits en total, de los cuales 335 no son merges y sirven de fuente para el contenido.

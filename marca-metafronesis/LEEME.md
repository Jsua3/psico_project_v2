# Marca Metafrónesis

Todo lo necesario para usar la marca en presentaciones, documentos, redes, impresos y en el sitio.

- **Metafrónesis** es la marca principal: el proyecto académico.
- **SIEP** es el simulador que forma parte de ella.
- **Lema:** *Explorar lo posible, para vivir lo humano.*

Para un vistazo rápido, abre `hoja-de-marca.png` o `hoja-de-marca.pdf`.

## Qué hay en la carpeta

| Carpeta | Contenido |
|---|---|
| `logos/svg/` | Logos en vector. Úsalos siempre que la herramienta acepte SVG (web, Figma, Illustrator, PowerPoint reciente). Escalan sin perder calidad. |
| `logos/png/` | Los mismos logos en PNG con fondo transparente, a 1024, 2048 y 4096 px de ancho. El isotipo va a 256, 512 y 1024 px. Para Word, Canva, redes y correos. |
| `favicon/` | Favicon del sitio: `favicon.svg`, `favicon.ico` (16, 32 y 48 px) y PNG de 16 a 64 px. También el ícono para iPhone (`apple-touch-icon.png`, 180 px) y los íconos de app de 192 y 512 px, sobre fondo oscuro. |
| `colores/` | La paleta en `paleta.css` (variables CSS) y en `paleta.json`. |
| `tipografia/` | Poppins (Regular, SemiBold y ExtraBold) con su licencia libre (OFL). |
| `original/` | El logo original sin fondo, del que salen todos los vectores. |

## Composiciones

| Archivo | Cuándo usarlo |
|---|---|
| `horizontal` | Isotipo, palabra y lema en una línea. Es el logo principal para portadas, encabezados y diapositivas. |
| `horizontal-compacto` | Isotipo y palabra, sin lema. Para barras, pies de página y espacios bajos. |
| `apilado` | Isotipo arriba, palabra y lema abajo. Para formatos cuadrados o verticales, como perfiles, carteles y cierres de video. |
| `isotipo` | Solo el símbolo: cuadros de píxel, perfil y Ψ. Para íconos, avatares, sellos y marcas de agua. |

## Versiones de color

| Carpeta | Cuándo usarla |
|---|---|
| `color-fondo-claro` | Sobre blanco o fondos claros. La palabra va en azul noche. |
| `color-fondo-oscuro` | Sobre fondos oscuros, como el `#0c1222` del sitio. La palabra va en blanco niebla y los degradados se aclaran. |
| `blanco` | Sobre fotos o fondos de color (por ejemplo, el degradado de marca), cuando el color no se lee. |
| `negro` | Impresión a una sola tinta, sellos, grabados y fotocopias. |

## Colores

| Nombre | Hex | Uso |
|---|---|---|
| Cian marca | `#1dbce7` | Cuadros de píxel, acentos frescos |
| Azul marca | `#1576d6` | Cuadros de píxel, enlaces y gráficos |
| Violeta acento (claro) | `#5b3fd1` | Botones y resaltados sobre fondo claro |
| Violeta acento (oscuro) | `#b69cff` | Botones y resaltados sobre fondo oscuro |
| Azul noche | `#0c3563` | La palabra sobre fondo claro |
| Blanco niebla | `#f2f4fb` | La palabra sobre fondo oscuro |
| Fondo oscuro | `#0c1222` | Piel oscura del sitio |
| Fondo claro | `#f5f7fa` | Piel clara del sitio |

Degradados del perfil, que van en diagonal de abajo a la izquierda hacia arriba a la derecha:

- Fondo claro: `#1a74cc → #5a2bc0 → #7a06ab`.
- Fondo oscuro: `#3f8ff0 → #7d5cf0 → #b062ee`.

La Ψ va de `#2f2c97` a `#7400b8` sobre fondo claro y de `#8c9bff` a `#c48cff` sobre fondo oscuro.

## Tipografía

- **Poppins** es la letra de la interfaz y de los documentos. ExtraBold para títulos, SemiBold para títulos cortos y botones, Regular para el texto corrido.
- La palabra **METAFRÓNESIS** del logo no es texto escrito con una fuente: es un dibujo vectorizado del logo original. Úsala siempre desde estos archivos y nunca la reescribas a mano.

## Reglas de uso

- **Espacio libre:** deja alrededor del logo, como mínimo, el alto de la «M» de METAFRÓNESIS. Ningún texto ni imagen entra en ese margen.
- **Tamaño mínimo:**
  - Logo horizontal: 160 px de ancho en pantalla o 35 mm impreso. Más pequeño, usa el compacto o el isotipo.
  - Isotipo: 24 px.
- **Contraste:** el logo a color va sobre fondos lisos claros u oscuros. Sobre fotos o colores intermedios, usa el blanco o el negro.
- **No hacer:**
  - Deformar, girar, cambiar los colores o agregar sombras o contornos.
  - Separar los cuadros de píxel del perfil.
  - Recolocar la Ψ.
  - Poner el logo a color sobre un fondo que compita con él.

## Cómo se regenera

Todo sale de los SVG del sitio, en `frontend/src/assets/branding/`, y del favicon, en `frontend/src/assets/favicon-metafronesis.svg`. Para rehacer la carpeta:

```
node .superpowers/landing/generar-marca.mjs
```

Ese comando se corre desde la raíz del repositorio principal. Después se arma el `.ico` con Pillow, a partir de `favicon/favicon-48.png`. La guía que estás leyendo se conserva al regenerar.

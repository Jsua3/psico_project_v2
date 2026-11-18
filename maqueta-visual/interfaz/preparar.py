"""Prepara los recursos de la maqueta de la interfaz unificada (bloque U1).

Copia y recorta, sin redibujar nada:
- la sala de espera de noche de P2 (render entero, mundo x1) como fondo;
- los cuadros quietos de Valentina (la estudiante) con su sombra de contacto por escalones;
- el Kit PAP del suelo, los retratos del kit (abuela y Valentina) y los iconos de herramientas de O1;
- las capturas del juego de hoy (WebP) para el lado «Hoy».

El arte de las placas (marcos, tramas, letras, iconos) ya está en arte/ (copiado de I1). Se corre desde la raíz del repo
principal o desde cualquier sitio: las rutas son absolutas respecto de este archivo.
"""
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
WT = AQUI.parents[1]                      # .worktrees/u1
RAIZ = WT.parents[1]                      # repo principal
NOCHE = RAIZ / '.superpowers' / 'noche-2026-11-14'
KIT = WT / 'frontend' / 'src' / 'assets' / 'characters' / 'kit'
OBJ = WT / 'frontend' / 'src' / 'assets' / 'game' / 'objects'
ARTE = AQUI / 'arte'
HOY = AQUI / 'hoy'

SOMBRA = (20, 18, 30)                     # el tono oscuro de la sala, no negro


def sombra_de_contacto(sprite: Image.Image) -> Image.Image:
    """Añade debajo de los pies una sombra por escalones (dos anillos de opacidad, sin difuminado)."""
    w, h = sprite.size
    alfa = sprite.getchannel('A')
    filas = [y for y in range(h) if any(alfa.getpixel((x, y)) for x in range(w))]
    pie = filas[-1]
    cols = [x for x in range(w) if alfa.getpixel((x, pie))]
    cx = (cols[0] + cols[-1]) / 2
    lienzo = Image.new('RGBA', (w, h + 4), (0, 0, 0, 0))
    px = lienzo.load()
    for y in range(-2, 3):
        for x in range(w):
            dx, dy = (x + 0.5 - cx) / 13, (y + 0.5) / 2.6
            d = dx * dx + dy * dy
            if d <= 1:
                px[x, pie + 1 + y] = SOMBRA + (150 if d <= 0.45 else 90,)
    lienzo.alpha_composite(sprite, (0, 0))
    return lienzo


def preparar():
    ARTE.mkdir(exist_ok=True)
    HOY.mkdir(exist_ok=True)
    Image.open(NOCHE / 'capturas-p2' / 'entera-sala-espera-noche.png').convert('RGB').save(ARTE / 'sala-espera-noche.png', optimize=True)

    hoja = Image.open(KIT / 'valentina' / 'idle.png').convert('RGBA')
    for fila, nombre in enumerate(['frente', 'izquierda', 'derecha', 'espalda']):
        cuadro = hoja.crop((0, fila * 72, 48, fila * 72 + 72))
        sombra_de_contacto(cuadro).save(ARTE / f'valentina-{nombre}.png')

    Image.open(OBJ / 'tool_pap.png').convert('RGBA').save(ARTE / 'kit-pap.png')
    for receta, caras in {'abuela-familia': ['cautelosa', 'preocupada'], 'valentina': ['neutral']}.items():
        for cara in caras:
            Image.open(KIT / receta / f'portrait-{cara}.png').convert('RGBA').save(ARTE / f'retrato-{receta}-{cara}.png')

    capturas = {
        'explorando-1366': 'capturas-demo-i1e/05-escena-siguiente.png',
        'explorando-1920': 'capturas-p2/juego-real-sala-espera-puerta-cerrada-noche-1920x1080.png',
        'puerta-1366': 'capturas-p2/juego-real-sala-espera-puerta-cerrada-noche-1366x768.png',
        'puerta-1920': 'capturas-p2/juego-real-sala-espera-puerta-cerrada-noche-1920x1080.png',
        'conversacion-1366': 'capturas-demo-i1e/02-conversacion-abuela.png',
        'conversacion-1920': 'capturas-demo/26-cuadro-cerrado-1-la-abuela-habla.png',
        'conversacion-390': 'capturas-i1/juego-real-telefono-390-1-conversacion.png',
        'decision-1366': 'capturas-demo/26-cuadro-cerrado-1366-decision-mas-larga.png',
        'decision-1920': 'capturas-demo/26-cuadro-cerrado-3-decision-entera.png',
        'decision-390': 'capturas-i1/decisiones-caben-390-con-aviso-breve.png',
        'aviso-1366': 'capturas-i1/decisiones-caben-1366-con-aviso-breve.png',
        'aviso-1920': 'capturas-i1/decisiones-caben-1920-con-aviso-breve.png',
        'pista-1366': 'capturas-demo/26-cuadro-cerrado-1366-decision-mas-larga.png',
        'pista-1920': 'capturas-demo/26-cuadro-cerrado-3-decision-entera.png',
        'capitulo-1366': 'capturas-demo-i1e/09-capitulo-2.png',
        'explorando-390': '../baseline-ui/F10-despues/estudiante__juego-mundo__390x844.png',
        'pausa-1366': '../baseline-ui/F10-despues/estudiante__juego-pausa__1440x900.png',
        'pausa-390': '../baseline-ui/F10-despues/estudiante__juego-pausa__390x844.png',
        'ira-1366': '../baseline-ui/F10-despues/estudiante__juego-ir-a__1440x900.png',
        'ira-390': '../baseline-ui/F10-despues/estudiante__juego-ir-a__390x844.png',
    }
    for clave, ruta in capturas.items():
        Image.open(NOCHE / ruta).convert('RGB').save(HOY / f'{clave}.webp', quality=82, method=6)
    print('listo:', len(list(ARTE.iterdir())), 'en arte,', len(capturas), 'capturas de hoy')


if __name__ == '__main__':
    preparar()

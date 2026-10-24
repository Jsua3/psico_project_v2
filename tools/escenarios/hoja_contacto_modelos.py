"""Hoja de contacto de la biblioteca de modelos: por grupo, cada modelo con su reposo y sus cuadros a ×4.

    python tools/escenarios/hoja_contacto_modelos.py [salida.png]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from arte_objetos import TAM  # noqa: E402
from arte_objetos.generar import CATALOGO, cargar_catalogo  # noqa: E402

ZOOM = 4
CELDA = TAM * ZOOM
FONDO = (28, 32, 42)
PAPEL = (58, 64, 80)
TEXTO = (232, 236, 248)
SUAVE = (169, 179, 204)
ORDEN = ['comunes', 'universidad', 'casa', 'comisaria']
TITULOS = {'comunes': 'Comunes', 'universidad': 'Universidad', 'casa': 'Casa', 'comisaria': 'Comisaría de familia'}


def fuente(px):
    try:
        return ImageFont.truetype('arial.ttf', px)
    except OSError:
        return ImageFont.load_default(size=px)


def hoja(salida):
    cat = cargar_catalogo()
    base = os.path.dirname(CATALOGO)
    grupos = {g: [m for m in cat['modelos'] if m['lugarSugerido'] == g] for g in ORDEN}
    f_titulo, f_nombre, f_nota = fuente(26), fuente(17), fuente(14)
    ancho_fila = 300 + CELDA * 5 + 60
    alto = 24
    for g in ORDEN:
        alto += 48 + len(grupos[g]) * (CELDA + 22)
    im = Image.new('RGB', (ancho_fila, alto), FONDO)
    d = ImageDraw.Draw(im)
    y = 16
    for g in ORDEN:
        d.text((24, y), TITULOS[g], fill=TEXTO, font=f_titulo)
        y += 44
        for m in grupos[g]:
            d.text((24, y + 8), m['nombre'], fill=TEXTO, font=f_nombre)
            d.text((24, y + 34), f"{m['tipo']} · {m['animacionCerca']['cuadros']} cuadros · {m['efecto']}", fill=SUAVE, font=f_nota)
            d.text((24, y + 56), m['alRevisar'][:48] + ('…' if len(m['alRevisar']) > 48 else ''), fill=SUAVE, font=f_nota)
            x = 300
            cuadros = []
            ruta_reposo = os.path.join(base, m['arte'])
            ruta_hoja = os.path.join(base, m['animacionCerca']['hoja'])
            if os.path.exists(ruta_reposo):
                cuadros.append(Image.open(ruta_reposo).convert('RGBA'))
            if os.path.exists(ruta_hoja):
                h = Image.open(ruta_hoja).convert('RGBA')
                cuadros += [h.crop((i * TAM, 0, (i + 1) * TAM, TAM)) for i in range(h.width // TAM)]
            for i, c in enumerate(cuadros):
                d.rectangle([x, y, x + CELDA - 1, y + CELDA - 1], fill=PAPEL)
                im.paste(c.resize((CELDA, CELDA), Image.NEAREST), (x, y), c.resize((CELDA, CELDA), Image.NEAREST))
                d.text((x + 4, y + CELDA + 2), 'reposo' if i == 0 else f'cerca {i}', fill=SUAVE, font=f_nota)
                x += CELDA + 10
            if not cuadros:
                d.text((300, y + 50), '[sin dibujar]', fill=(240, 160, 160), font=f_nombre)
            y += CELDA + 22
        y += 4
    im.save(salida)
    return salida


if __name__ == '__main__':
    destino = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(CATALOGO), 'hoja-contacto.png')
    print(hoja(destino))

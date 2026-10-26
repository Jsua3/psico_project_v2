"""Hoja general de la biblioteca: la primera sala de cada lugar del índice, con sus cifras.

Lee escenarios/indice.json, compone la primera sala de cada lugar (muebles, personajes y objetos
en su sitio) a media escala y escribe debajo sus cifras: salas, muebles, objetos, herramientas,
personajes, hitos y nivel de riesgo. Un lugar con `arteProvisional` lleva la marca «arte provisional».

    python tools/escenarios/hoja_lugares.py [<carpeta escenarios>] [<salida.png>] [--kit <dir>]
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from hoja_contacto import ALTO_SALA, ANCHO_SALA, KIT_POR_DEFECTO, _fuente, componer_sala  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIR_ESCENARIOS = os.path.join(RAIZ, 'biblioteca', 'escenarios')
SALIDA_POR_DEFECTO = os.path.join(RAIZ, 'biblioteca', 'hoja-lugares.png')

ESCALA = 0.5
ANCHO_CELDA, ALTO_CELDA = int(ANCHO_SALA * ESCALA), int(ALTO_SALA * ESCALA)
ROTULO = 44          # título del lugar, encima
PIE = 72             # cifras, debajo
MARGEN = 16
COLUMNAS = 3
FONDO_HOJA = (27, 27, 34)
TINTA = (230, 230, 236)
TINTA_SUAVE = (170, 170, 182)
MARCA = (214, 150, 60)
RIESGO_LEGIBLE = {'VARIABLE': 'riesgo variable', 'MODERATE': 'riesgo moderado', 'SEVERE': 'riesgo severo', 'EXTREME': 'riesgo extremo'}


def ancho_hoja(columnas):
    return MARGEN + columnas * (ANCHO_CELDA + MARGEN)


def alto_hoja(filas):
    return MARGEN + filas * (ROTULO + ALTO_CELDA + PIE + MARGEN)


def origen_celda(indice, columnas):
    fila, col = divmod(indice, columnas)
    return MARGEN + col * (ANCHO_CELDA + MARGEN), MARGEN + fila * (ROTULO + ALTO_CELDA + PIE + MARGEN) + ROTULO


def cifras_de(escenario):
    cat = escenario['catalogo']
    return {
        'salas': len(escenario['salas']), 'muebles': len(cat['muebles']), 'objetos': len(cat['objetos']),
        'herramientas': len(cat['herramientas']), 'personajes': len(escenario['personajes']),
        'hitos': len(escenario.get('hitos', [])), 'riesgo': escenario.get('nivelRiesgoPorDefecto'),
    }


def hoja_lugares(dir_escenarios=DIR_ESCENARIOS, out=SALIDA_POR_DEFECTO, kit_dir=None):
    with open(os.path.join(dir_escenarios, 'indice.json'), encoding='utf-8') as f:
        indice = json.load(f)
    lugares = []
    for entrada in indice['lugares']:
        ruta = os.path.join(dir_escenarios, entrada['id'], 'escenario.json')
        if not os.path.exists(ruta):
            raise SystemExit(f'El índice nombra el lugar "{entrada["id"]}" y no existe {ruta}')
        with open(ruta, encoding='utf-8') as f:
            lugares.append((entrada, json.load(f), os.path.dirname(ruta)))
    if not lugares:
        raise SystemExit('El índice no tiene lugares.')

    columnas = min(COLUMNAS, len(lugares))
    filas = math.ceil(len(lugares) / columnas)
    hoja = Image.new('RGB', (ancho_hoja(columnas), alto_hoja(filas)), FONDO_HOJA)
    d = ImageDraw.Draw(hoja)
    titulo, cuerpo, pequena = _fuente(22), _fuente(15), _fuente(13)
    info = []
    for i, (entrada, escenario, base) in enumerate(lugares):
        x0, y0 = origen_celda(i, columnas)
        sala = componer_sala(base, escenario['salas'][0], escenario, kit_dir or KIT_POR_DEFECTO)
        hoja.paste(sala.resize((ANCHO_CELDA, ALTO_CELDA), Image.NEAREST), (x0, y0))
        marca = 'arte provisional' if escenario.get('arteProvisional') else None
        d.text((x0, y0 - ROTULO + 10), escenario['nombre'], fill=TINTA, font=titulo)
        if marca:
            ancho_nombre = d.textlength(escenario['nombre'], font=titulo)
            d.rectangle([x0 + ancho_nombre + 12, y0 - ROTULO + 12, x0 + ancho_nombre + 12 + d.textlength(marca, font=pequena) + 12, y0 - ROTULO + 34],
                        outline=MARCA, width=2)
            d.text((x0 + ancho_nombre + 18, y0 - ROTULO + 15), marca, fill=MARCA, font=pequena)
        c = cifras_de(escenario)
        linea1 = f"{c['salas']} salas · {c['muebles']} muebles · {c['objetos']} objetos · {c['herramientas']} herramientas"
        linea2 = f"{c['personajes']} personajes · {c['hitos']} hitos · {RIESGO_LEGIBLE.get(c['riesgo'], 'sin nivel de riesgo')}"
        linea3 = f"primera sala: {escenario['salas'][0]['nombre']}" + ('' if escenario.get('completo') else ' · lugar incompleto')
        d.text((x0, y0 + ALTO_CELDA + 8), linea1, fill=TINTA, font=cuerpo)
        d.text((x0, y0 + ALTO_CELDA + 28), linea2, fill=TINTA, font=cuerpo)
        d.text((x0, y0 + ALTO_CELDA + 48), linea3, fill=TINTA_SUAVE, font=pequena)
        info.append({'id': escenario['id'], 'marca': marca, 'cifras': c})
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    hoja.save(out)
    return {'lugares': info}


if __name__ == '__main__':
    args = sys.argv[1:]
    kit = None
    if '--kit' in args:
        i = args.index('--kit')
        kit = args[i + 1]
        del args[i:i + 2]
    if len(args) > 2:
        raise SystemExit('Uso: python tools/escenarios/hoja_lugares.py [<carpeta escenarios>] [<salida.png>] [--kit <dir>]')
    resultado = hoja_lugares(args[0] if args else DIR_ESCENARIOS, args[1] if len(args) > 1 else SALIDA_POR_DEFECTO, kit_dir=kit)
    for lugar in resultado['lugares']:
        print(f"{lugar['id']}: {lugar['cifras']['salas']} salas{' · ' + lugar['marca'] if lugar['marca'] else ''}")

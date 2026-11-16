"""Construye maqueta.html desde plantilla.html incrustando el arte (arte/) y las capturas de hoy (hoy/) como data: URI.

Uso: python construir.py   (después de preparar.py). Una sola página, sin archivos al lado: se publica tal cual.
"""
import base64
import json
from pathlib import Path

AQUI = Path(__file__).resolve().parent


def data_uri(ruta: Path) -> str:
    tipo = 'image/webp' if ruta.suffix == '.webp' else 'image/png'
    return f'data:{tipo};base64,' + base64.b64encode(ruta.read_bytes()).decode('ascii')


def construir() -> Path:
    arte = {p.stem: data_uri(p) for p in sorted((AQUI / 'arte').glob('*.png'))}
    for p in sorted((AQUI / 'arte' / 'herramientas').glob('*-20.png')):
        arte['herramienta-' + p.stem.removesuffix('-20')] = data_uri(p)
    hoy = {p.stem: data_uri(p) for p in sorted((AQUI / 'hoy').glob('*.webp'))}
    html = (AQUI / 'plantilla.html').read_text(encoding='utf-8')
    html = html.replace('/*__ARTE__*/', 'const ARTE = ' + json.dumps(arte) + ';', 1)
    html = html.replace('/*__HOY__*/', 'const HOY = ' + json.dumps(hoy) + ';', 1)
    salida = AQUI / 'maqueta.html'
    salida.write_text(html, encoding='utf-8')
    print(f'{salida.name}: {salida.stat().st_size / 1024:.0f} KB, {len(arte)} piezas de arte, {len(hoy)} capturas de hoy')
    return salida


if __name__ == '__main__':
    construir()

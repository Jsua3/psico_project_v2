"""Universidad: muebles al oficio v2 (bloque O1). Los que ya tienen un dibujo equivalente lo reutilizan (con la tela
de la universidad donde cambia); los demás se dibujan aquí, a la densidad de los personajes y con silueta limpia.

    python tools/escenarios/objetos_universidad_muebles.py     # hoja de antes y después en maqueta-visual/objetos/
"""
import os
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import objetos_casa as oca  # noqa: E402
import objetos_comisaria as ocm  # noqa: E402
import objetos_comisaria_b as ocb  # noqa: E402
import objetos_pixel as op  # noqa: E402
from objetos_pixel import Lienzo, Reflejo  # noqa: E402

B = 'escenarios/universidad/arte/muebles/'
ROJO, AZUL, VERDE, AMARILLO = (196, 84, 78), (70, 110, 160), (96, 170, 104), (230, 192, 86)
LOMOS = ((176, 70, 64), (70, 104, 150), (210, 180, 110), (80, 130, 96), (150, 110, 160), (220, 214, 196), (110, 80, 60))


def _reflejos(L):
    return {lado: Reflejo(L.w, L.h) for lado in op.LADOS}


def _igual(fuente, ref, archivo, **cambios):
    """La ficha de otro lugar, con `cambios` y el `reemplaza` de la universidad."""
    ficha = dict(fuente.PIEZAS[ref])
    ficha.update(cambios)
    ficha['reemplaza'] = B + archivo + '.png'
    return ficha


def _libros(L, x0, x1, base, alto, semilla):
    """Una fila de lomos de libros de alto variable, con su sombra al pie."""
    x, k = x0, semilla
    while x < x1 - 2:
        ancho = 2 + (k % 3 == 0)
        a = alto - (k * 7) % 4
        c = LOMOS[k % len(LOMOS)]
        L.rect(x, base - a, x + ancho - 1, base, c, tex=False)
        L.rect(x, base - a, x + ancho - 1, base - a, op.mezcla(c, (255, 255, 255), 0.25), tex=False)
        x += ancho + (1 if k % 5 == 0 else 0)
        k += 1
    L.rect(x0, base, x1, base, (40, 30, 26), tex=False)


def estante_libros(n=0):
    """Estante de oficina de tres repisas con libros, carpetas y una matera pequeña."""
    L = Lienzo(64, 78, semilla=221)
    L.bloque(1, 1, 62, 75, 'roble', tapa=3)
    L.rect(4, 6, 59, 72, 'roble', 5, tex=False)                                     # fondo en sombra
    for y in (27, 49, 72):                                                          # repisas
        L.rect(4, y - 1, 59, y, 'roble', 2, tex=False)
        L.rect(4, y - 1, 59, y - 1, 'roble', 1, tex=False)
    _libros(L, 5, 44, 25, 15, 1)
    L.elipse(47, 17, 56, 25, 'barro', 2)                                            # matera
    L.elipse(47, 11, 56, 19, 'hoja', 1)
    _libros(L, 5, 30, 47, 16, 4)
    for k in range(4):                                                              # carpetas acostadas
        L.rect(34, 44 - k * 3, 57, 46 - k * 3, ('manila', 'tela-azul', 'manila', 'lino-rojo')[k], 1 + k % 2, tex=False)
    _libros(L, 5, 58, 70, 18, 9)
    r = _reflejos(L)
    r['izquierda'].rect(2, 2, 30, 2, 1)
    r['derecha'].rect(32, 2, 61, 2, 1)
    return L, r, None


def archivador(n=0):
    """Archivador metálico de cuatro gavetas; al revisarlo la de arriba se abre con sus carpetas colgantes."""
    abierto = (0, -1, 4, 7, 6)[n]
    L = Lienzo(42, 58, semilla=223)
    L.bloque(1, 1, 40, 55, 'acero', tapa=3)
    for k in (3, 2, 1):                                                             # de abajo hacia arriba
        ocm._cajon(L, 4, 37, 6 + k * 12, 16 + k * 12, 0, contenido=False)
    ocm._cajon(L, 4, 37, 6, 16, abierto)
    r = _reflejos(L)
    for rr, dx in ((r['izquierda'], -3), (r['derecha'], 3), (r['frente'], 0)):
        for k in range(4):
            rr.rect(20 + dx - 1, 8 + k * 12 + (max(abierto, 0) if k == 0 else 0), 20 + dx + 1, 8 + k * 12 + (max(abierto, 0) if k == 0 else 0), 2)
        rr.rect(2, 2, 39, 2, 1)
    return L, r, None


def pupitre(n=0):
    """Pupitre universitario de brazo, con un cuaderno abierto y un lapicero."""
    L = Lienzo(48, 40, semilla=225)
    L.rect(6, 2, 38, 18, 'plastico-gris', 2)                                        # espaldar
    L.rect(6, 2, 38, 2, 'plastico-gris', 0, tex=False)
    L.rect(6, 17, 38, 18, 'plastico-gris', 4, tex=False)
    L.rect(4, 20, 36, 24, 'plastico-gris', 1)                                       # asiento
    L.rect(4, 24, 36, 25, 'plastico-gris', 3, tex=False)
    L.bloque(26, 12, 46, 20, 'laminado', tapa=4, base=1)                            # brazo-mesa
    L.rect(29, 11, 40, 15, 'papel', 0, tex=False)                                   # cuaderno
    L.rect(34, 11, 34, 15, 'papel', 3, tex=False)
    L.linea(37, 14, 43, 11, AZUL)                                                   # lapicero
    for x in (7, 33):                                                               # patas de tubo
        L.rect(x, 26, x + 1, 37, 'acero', 2)
    L.rect(5, 37, 36, 37, 'acero', 3, tex=False)
    L.rect(43, 21, 44, 37, 'acero', 2)
    r = _reflejos(L)
    r['izquierda'].rect(27, 13, 34, 13, 1)
    r['derecha'].rect(38, 13, 45, 13, 1)
    return L, r, None


def tablero(n=0):
    """Tablero blanco de pie con una clase a medias: un esquema, flechas y la bandeja con los marcadores."""
    L = Lienzo(182, 112, semilla=227)
    for x in (12, 166):                                                             # patas
        L.rect(x, 80, x + 3, 108, 'cromo', 2)
        L.rect(x - 7, 107, x + 10, 109, 'cromo', 4, tex=False)
    L.rect(2, 2, 179, 82, 'cromo', 2)                                               # marco
    L.rect(2, 2, 179, 2, 'cromo', 0, tex=False)
    L.rect(5, 5, 176, 78, 'blanco-clinico', 0)                                      # la superficie blanca
    L.rect(5, 5, 176, 6, 'blanco-clinico', 2, tex=False)
    for x0, y0, c in ((16, 16, AZUL), (72, 16, VERDE), (128, 16, ROJO), (44, 46, AZUL), (100, 46, VERDE)):   # el esquema
        L.rect(x0, y0, x0 + 34, y0 + 16, c, tex=False)
        L.rect(x0 + 2, y0 + 2, x0 + 32, y0 + 14, 'blanco-clinico', 0, tex=False)
        L.rect(x0 + 6, y0 + 6, x0 + 24, y0 + 7, op.mezcla(c, (0, 0, 0), 0.2), tex=False)
        L.rect(x0 + 6, y0 + 10, x0 + 18, y0 + 11, op.mezcla(c, (0, 0, 0), 0.2), tex=False)
    for (xa, ya, xb, yb) in ((50, 24, 72, 24), (106, 24, 128, 24), (60, 32, 60, 46), (116, 32, 116, 46)):   # flechas
        L.rect(min(xa, xb), min(ya, yb), max(xa, xb), max(ya, yb) + (1 if ya == yb else 0), (70, 70, 90), tex=False)
    L.rect(4, 80, 177, 83, 'cromo', 1)                                              # bandeja de marcadores
    for k, c in enumerate((AZUL, ROJO, VERDE)):
        L.rect(30 + k * 8, 79, 35 + k * 8, 80, c, tex=False)
    L.rect(150, 78, 160, 80, 'tela-gris', 2, tex=False)                             # borrador
    r = _reflejos(L)
    r['izquierda'].diagonal(8, 74, 22, 3, 1)
    r['derecha'].diagonal(172, 74, 22, 3, 1, sentido=-1)
    r['frente'].rect(10, 7, 170, 7, 1)
    for rr in r.values():
        rr.rect(3, 3, 178, 3, 2)
    return L, r, None


def mesa_cafeteria(n=0):
    """Mesa redonda de cafetería con un servilletero y dos vasos."""
    L = Lienzo(58, 38, semilla=229)
    L.rect(26, 14, 31, 33, 'cromo', 2)                                              # pata central
    L.elipse(14, 31, 43, 36, 'cromo', 3)
    L.elipse(2, 1, 55, 16, 'formica', 1)                                            # tablero redondo
    L.rect(4, 12, 53, 14, 'formica', 3, tex=False)
    L.elipse(4, 2, 53, 12, 'formica', 0)
    L.rect(22, 2, 30, 8, 'cromo', 2)                                                # servilletero
    L.rect(23, 1, 29, 4, 'papel', 0, tex=False)
    for x in (10, 38):
        L.rect(x, 3, x + 4, 9, 'vidrio', 1, tex=False)
        L.rect(x + 1, 6, x + 3, 8, (196, 120, 70), tex=False)                       # jugo
    r = _reflejos(L)
    r['izquierda'].rect(6, 5, 16, 5, 2)
    r['derecha'].rect(40, 5, 51, 5, 2)
    r['frente'].rect(18, 3, 38, 3, 1)
    return L, r, None


def silla_cafeteria(n=0):
    """Silla de cafetería de plástico rojo con patas de tubo."""
    L = Lienzo(24, 34, semilla=231)
    L.cojin(2, 1, 21, 12, 'lino-rojo', r=2, arriba=0.25, abajo=0.25)                   # espaldar recto
    L.rect(10, 13, 13, 15, 'acero', 3, tex=False)
    L.rect(2, 16, 21, 20, 'lino-rojo', 1)
    L.rect(2, 16, 21, 16, 'lino-rojo', 0, tex=False)
    L.rect(2, 20, 21, 21, 'lino-rojo', 4, tex=False)
    for x in (3, 19):
        L.rect(x, 21, x + 1, 31, 'acero', 2)
    L.rect(5, 26, 18, 26, 'acero', 3, tex=False)
    return L, _reflejos(L), None


def barra_cafeteria(n=0):
    """Barra de la cafetería: vitrina de vidrio con panes y empanadas, caja registradora y la greca del café (vapor)."""
    L = Lienzo(202, 74, semilla=233)
    L.bloque(1, 30, 200, 71, 'laminado', tapa=6)                                    # mueble de la barra, laminado
    L.rect(1, 50, 200, 53, (196, 84, 78), tex=False)                                # franja
    L.rect(10, 6, 90, 31, 'cromo', 2)                                               # vitrina de vidrio
    L.rect(12, 8, 88, 29, 'vidrio', 3, tex=False)
    for k in range(6):                                                              # panes y empanadas
        x = 15 + k * 12
        L.elipse(x, 20, x + 9, 27, (214, 160, 92), tex=False)
        L.rect(x + 2, 21, x + 6, 22, (236, 196, 132), tex=False)
    L.rect(12, 18, 88, 18, 'cromo', 2, tex=False)
    L.rect(110, 16, 132, 31, 'plastico-negro', 2)                                   # caja registradora
    L.rect(113, 18, 129, 22, (96, 140, 196), tex=False)
    L.rect(150, 4, 176, 31, 'cromo', 1)                                             # la greca
    L.rect(150, 4, 176, 5, 'cromo', 0, tex=False)
    L.rect(157, 22, 169, 26, 'plastico-negro', 3, tex=False)
    for k in range(3):                                                              # vapor que sube
        x = 158 + k * 4 + (1 if (n + k) % 4 in (1, 2) else 0)
        y = 1 - ((n + k) % 3)
        if y >= 0:
            L.rect(x, y, x, y + 1, (236, 232, 226), tex=False)
    em = L.caja_mascara(113, 18, 129, 22)
    r = _reflejos(L)
    r['izquierda'].diagonal(14, 28, 18, 2, 2)
    r['derecha'].diagonal(86, 28, 18, 2, 2, sentido=-1)
    r['frente'].rect(14, 9, 86, 9, 1)
    for rr in r.values():
        rr.rect(151, 6, 152, 30, 2)
    return L, r, em


def banca(n=0):
    """Banca de parque universitaria: listones de madera sobre patas de hierro."""
    L = Lienzo(102, 34, semilla=235)
    for y in (1, 5, 9):                                                             # espaldar
        L.rect(6, y, 95, y + 2, 'pino', 2)
        L.rect(6, y, 95, y, 'pino', 1, tex=False)
    for y in (15, 19):                                                              # asiento
        L.rect(2, y, 99, y + 2, 'pino', 1)
        L.rect(2, y + 2, 99, y + 2, 'pino', 3, tex=False)
    for x in (8, 90):                                                               # hierro
        L.rect(x, 1, x + 3, 31, 'plastico-negro', 2)
        L.rect(x - 2, 30, x + 5, 31, 'plastico-negro', 4, tex=False)
    return L, _reflejos(L), None


def _variante(funcion, **kw):
    return lambda n=0: funcion(n, **kw)


PIEZAS = {
    # Reutilizados: el mismo dibujo del lugar donde nació (las telas cambian donde la universidad las tiene distintas).
    'escritorio': _igual(ocm, 'escritorio-funcionario', archivo='escritorio'),
    'silla-oficina': _igual(ocm, 'silla-giratoria', archivo='silla-oficina'),
    'silla-visitante': _igual(ocm, 'silla-visitante-comisaria', archivo='silla-visitante'),
    'sillon': _igual(oca, 'sillon-casa', archivo='sillon', dibujar=_variante(oca.sillon, tela='tela-gris')),
    'sofa': _igual(oca, 'sofa-casa', archivo='sofa', dibujar=_variante(oca.sofa, tela='tela-azul')),
    'mesa-centro': _igual(oca, 'mesa-centro-casa', archivo='mesa-centro'),
    'planta': _igual(ocm, 'planta-oficina', archivo='planta'),
    'mostrador': _igual(ocm, 'mostrador-recepcion', archivo='mostrador'),
    'sillas-espera': _igual(ocm, 'sillas-espera-comisaria', archivo='sillas-espera'),
    'cartelera': _igual(ocm, 'cartelera-comisaria', archivo='cartelera'),
    'caneca': _igual(ocm, 'caneca-comisaria', archivo='caneca'),
    'dispensador-agua': dict(ocm.PIEZAS['dispensador-agua'], tipo='mueble', reemplaza=B + 'dispensador-agua.png'),
    # Nuevos.
    'estante-libros': dict(nombre='Estante de libros', tipo='mueble', dibujar=estante_libros, cuadros=1,
                           huella=dict(ancho=60, fondo=14, alto=72), material='madera', reemplaza=B + 'estante-libros.png'),
    'archivador': dict(nombre='Archivador', tipo='mueble', dibujar=archivador, cuadros=5,
                       huella=dict(ancho=38, fondo=14, alto=52), material='acero',
                       animaciones=dict(reposo=dict(de=0, hasta=0, fps=1, bucle=True),
                                        revisar=dict(de=1, hasta=4, fps=10, bucle=False, sostener=True)),
                       reemplaza=B + 'archivador.png'),
    'pupitre': dict(nombre='Pupitre', tipo='mueble', dibujar=pupitre, cuadros=1,
                    huella=dict(ancho=40, fondo=12, alto=34), material='plástico y laminado', reemplaza=B + 'pupitre.png'),
    'tablero': dict(nombre='Tablero', tipo='mueble', dibujar=tablero, cuadros=1,
                    huella=dict(ancho=170, fondo=8, alto=104), material='tablero blanco', reemplaza=B + 'tablero.png'),
    'mesa-cafeteria': dict(nombre='Mesa de cafetería', tipo='mueble', dibujar=mesa_cafeteria, cuadros=1,
                           huella=dict(ancho=50, fondo=14, alto=34), material='fórmica y cromo', reemplaza=B + 'mesa-cafeteria.png'),
    'silla-cafeteria': dict(nombre='Silla de cafetería', tipo='mueble', dibujar=silla_cafeteria, cuadros=1,
                            huella=dict(ancho=20, fondo=10, alto=30), material='plástico', reemplaza=B + 'silla-cafeteria.png'),
    'barra-cafeteria': dict(nombre='Barra de la cafetería', tipo='mueble', dibujar=barra_cafeteria, cuadros=4,
                            huella=dict(ancho=196, fondo=16, alto=44), material='madera, vidrio y cromo',
                            animaciones=dict(reposo=dict(de=0, hasta=3, fps=4, bucle=True)), reemplaza=B + 'barra-cafeteria.png'),
    'banca': dict(nombre='Banca', tipo='mueble', dibujar=banca, cuadros=1,
                  huella=dict(ancho=96, fondo=12, alto=30), material='madera y hierro', reemplaza=B + 'banca.png'),
}


if __name__ == '__main__':
    import objetos_hoja
    objetos_hoja.hoja_lugar('universidad_muebles', PIEZAS)

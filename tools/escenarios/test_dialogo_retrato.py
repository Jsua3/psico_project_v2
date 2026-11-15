"""El retrato fino: 96 x 96, oficio de píxel, cabeza redonda y expresiones que se leen sin el rótulo."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dialogo_retrato as dr  # noqa: E402

RECETA = 'abuela-familia'
CARA = {(x, y) for y in range(26, 76) for x in range(22, 74)}      # donde van cejas, ojos, nariz, boca y marcas
OJOS = [(x, y) for cx in dr.OJOS for x in range(cx - 7, cx + 7) for y in range(dr.OJO_Y - 6, dr.OJO_Y + 6)]


def leer(r):
    """Qué expresión es, mirando solo lo que se mide en la cara (como la leería quien no ve el rótulo)."""
    if r['abierta'] and r['filas'] >= 7:
        return 'en-crisis'            # ojos muy abiertos y boca abierta
    if r['blanco'] == 0 and r['curva'] <= -1.5:
        return 'alegre'               # ojos en arco y comisuras hacia arriba
    if r['curva'] >= 1.5 and r['filas'] < 5:
        return 'triste'               # comisuras hacia abajo y párpados caídos
    if abs(r['mirada']) >= 1.5 and r['pendiente'] < 0:
        return 'cautelosa'            # mirada de lado, ceño bajo y ojos entornados
    if r['pendiente'] >= 2.5:
        return 'preocupada'           # cejas levantadas hacia el centro, ojos abiertos, boca pequeña
    return 'neutral'


def test_el_retrato_fino_mide_96_y_cumple_el_oficio():
    for estado in dr.ESTADOS:
        for cerrado in (False, True):
            im = dr.retrato_fino(RECETA, estado, cerrado)
            assert im.size == (96, 96)
            assert {a for *_, a in im.getdata()} <= {0, 255}, estado
            assert len(im.getcolors(256)) <= 40, (estado, len(im.getcolors(256)))


def test_el_contorno_es_de_un_pixel():
    px = dr.retrato_fino(RECETA, 'neutral').load()
    gruesos = [(x, y) for y in range(1, 95) for x in range(1, 95)
               if px[x, y] == dr.CONTORNO and all(px[x + dx, y + dy] == dr.CONTORNO for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    assert gruesos == []


def test_la_mandibula_es_redonda_y_no_una_punta():
    c = dr.colores_de(RECETA)
    px = dr.retrato_fino(RECETA, 'neutral').load()
    piel = set(c['pieles'])

    def ancho(y):
        xs = [x for x in range(96) if px[x, y] in piel]
        return max(xs) - min(xs) + 1

    assert ancho(60) >= 44      # a la altura de la boca la cara sigue ancha
    assert ancho(68) >= 28      # y cierra en curva: con la ampliación sola aquí quedaban unos 20 px, en punta
    assert ancho(60) - ancho(68) < ancho(68)


def test_los_ojos_miden_12_px_y_tienen_iris_pupila_y_brillo():
    c = dr.colores_de(RECETA)
    px = dr.retrato_fino(RECETA, 'neutral').load()
    for cx in dr.OJOS:
        fila = [x for x in range(cx - 8, cx + 8) if px[x, dr.OJO_Y] in (c['blanco'], c['ojo']) or px[x, dr.OJO_Y][:3] != c['piel'][:3] and px[x, dr.OJO_Y] not in set(c['pieles'])]
        assert max(fila) - min(fila) + 1 >= 12, cx
        caja = {px[x, y] for x in range(cx - 6, cx + 6) for y in range(dr.OJO_Y - 4, dr.OJO_Y + 3)}
        assert c['blanco'] in caja and c['ojo'] in caja and dr.BRILLO in caja


def test_cada_expresion_se_lee_sin_el_rotulo():
    for estado in dr.ESTADOS:
        medido = dr.rasgos(dr.retrato_fino(RECETA, estado), RECETA)
        assert leer(medido) == estado, (estado, medido)


def test_las_seis_expresiones_se_distinguen_de_las_otras_cinco():
    caras = {e: dr.retrato_fino(RECETA, e) for e in dr.ESTADOS}
    for a in dr.ESTADOS:
        for b in dr.ESTADOS:
            if a < b:
                distintos = sum(1 for p in CARA if caras[a].getpixel(p) != caras[b].getpixel(p))
                assert distintos >= 60, (a, b, distintos)


def test_solo_cambia_la_cara_entre_expresiones():
    a, b = dr.retrato_fino(RECETA, 'neutral'), dr.retrato_fino(RECETA, 'en-crisis')
    fuera = [(x, y) for y in range(96) for x in range(96) if (x, y) not in CARA and a.getpixel((x, y)) != b.getpixel((x, y))]
    assert fuera == []


def test_el_parpadeo_cierra_los_ojos():
    c = dr.colores_de(RECETA)
    for estado in ('neutral', 'preocupada', 'triste', 'cautelosa', 'en-crisis'):
        abierto, cerrado = dr.retrato_fino(RECETA, estado), dr.retrato_fino(RECETA, estado, cerrado=True)
        assert any(abierto.getpixel(p) == c['blanco'] for p in OJOS), estado
        assert not any(cerrado.getpixel(p) in (c['blanco'], dr.BRILLO) for p in OJOS), estado


def test_el_retrato_de_reserva_es_un_busto_sin_rasgos_al_mismo_oficio():
    im = dr.retrato_reserva()
    assert im.size == (96, 96)
    assert {a for *_, a in im.getdata()} <= {0, 255}
    colores = {c for _, c in im.getcolors(256) if c[3]}
    assert colores == set(dr.RESERVA) | {dr.CONTORNO}            # tres tonos de la placa y el contorno: sin cara
    px = im.load()
    lleno = {(x, y) for y in range(96) for x in range(96) if px[x, y][3]}
    assert all((95 - x, y) in lleno for x, y in lleno)            # la silueta es simétrica
    assert (47, 20) in lleno and (47, 60) in lleno and (20, 90) in lleno and (75, 90) in lleno   # cabeza y hombros
    assert (10, 30) not in lleno and (47, 8) not in lleno

"""El retrato fino de muestra: 96 x 96, oficio de píxel y expresiones que se distinguen."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dialogo_retrato as dr  # noqa: E402

RECETA = 'abuela-familia'
CARA = [(x, y) for y in range(30, 72) for x in range(26, 70)]      # donde van cejas, ojos, nariz y boca
OJOS = [(x, y) for y in range(43, 56) for x in list(range(30, 42)) + list(range(53, 65))]


def test_el_retrato_fino_mide_96_y_cumple_el_oficio():
    for estado in dr.ESTADOS:
        im = dr.retrato_fino(RECETA, estado)
        assert im.size == (96, 96)
        assert {a for *_, a in im.getdata()} <= {0, 255}, estado
        assert len(im.getcolors(256)) <= 40, estado


def test_el_contorno_queda_de_un_pixel():
    im = dr.retrato_fino(RECETA, 'neutral')
    px = im.load()
    gruesos = sum(1 for y in range(1, 95) for x in range(1, 95)
                  if px[x, y] == dr.CONTORNO and all(px[x + dx, y + dy][3] for dx in (-1, 0, 1) for dy in (-1, 0, 1))
                  and all(px[x + dx, y + dy] == dr.CONTORNO for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))))
    assert gruesos == 0


def test_las_seis_expresiones_se_distinguen_en_la_cara():
    caras = {e: dr.retrato_fino(RECETA, e) for e in dr.ESTADOS}
    for a in dr.ESTADOS:
        for b in dr.ESTADOS:
            if a < b:
                distintos = sum(1 for p in CARA if caras[a].getpixel(p) != caras[b].getpixel(p))
                assert distintos >= 40, (a, b, distintos)


def test_solo_cambia_la_cara_entre_expresiones():
    a, b = dr.retrato_fino(RECETA, 'neutral'), dr.retrato_fino(RECETA, 'en-crisis')
    fuera = [(x, y) for y in range(96) for x in range(96) if (x, y) not in set(CARA) and a.getpixel((x, y)) != b.getpixel((x, y))]
    assert fuera == []


def test_el_parpadeo_cierra_los_ojos():
    for estado in ('neutral', 'preocupada', 'triste', 'cautelosa', 'en-crisis'):
        abierto, cerrado = dr.retrato_fino(RECETA, estado), dr.retrato_fino(RECETA, estado, cerrado=True)
        assert any(abierto.getpixel(p) == (255, 255, 255, 255) for p in OJOS), estado
        assert not any(cerrado.getpixel(p) in ((255, 255, 255, 255), dr.BLANCO) for p in OJOS), estado

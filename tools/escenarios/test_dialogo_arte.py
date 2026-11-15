"""El arte de la interfaz de diálogo cumple el oficio: marcos de 12 x 12, alfa binario, pocos colores y texto legible."""
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dialogo_arte as da  # noqa: E402

KIT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'frontend', 'src', 'assets',
                                    'characters', 'kit'))


def _luminancia(c):
    def canal(v):
        v = v / 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (canal(v) for v in c[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b):
    la, lb = sorted((_luminancia(a), _luminancia(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def test_los_marcos_son_de_12_con_alfa_binario_y_pocos_colores():
    for momento in da.MOMENTOS:
        for nombre in da.MARCOS:
            im = da.marco(nombre, momento)
            assert im.size == (12, 12), nombre
            assert im.mode == 'RGBA'
            assert {a for *_, a in im.getdata()} <= {0, 255}, nombre
            assert len(im.getcolors(256)) <= 40, nombre


def test_las_esquinas_de_los_marcos_son_transparentes():
    for nombre in da.MARCOS:
        im = da.marco(nombre, 'noche')
        for x, y in ((0, 0), (11, 0), (0, 11), (11, 11)):
            assert im.getpixel((x, y))[3] == 0, (nombre, x, y)


def test_las_tramas_son_de_8_y_opacas():
    for momento in da.MOMENTOS:
        for nombre in da.TRAMAS:
            im = da.trama(nombre, momento)
            assert im.size == (8, 8)
            assert {a for *_, a in im.getdata()} == {255}, nombre


def test_el_texto_contrasta_con_todo_relleno():
    for momento in da.MOMENTOS:
        for nombre in da.TRAMAS:
            tinta = da.tinta_de(nombre, momento)
            for color in {c[:3] for c in da.trama(nombre, momento).getdata()}:
                assert contraste(tinta, color) >= 4.5, (nombre, momento, color)


def test_el_parpadeo_cierra_los_ojos_y_no_toca_nada_mas():
    for receta in ('abuela-familia', 'psicologa-hospitalaria', 'samuel', 'adolescente', 'medico-guardia'):
        for estado in ('neutral', 'preocupada', 'triste', 'cautelosa', 'en-crisis'):
            abierto = Image.open(os.path.join(KIT, receta, f'portrait-{estado}.png')).convert('RGBA')
            cerrado = da.parpadeo(abierto)
            distintos = [(x, y) for y in range(32) for x in range(32) if abierto.getpixel((x, y)) != cerrado.getpixel((x, y))]
            assert 4 <= len(distintos) <= 24, (receta, estado, len(distintos))
            assert all(8 <= y <= 20 for _, y in distintos), (receta, estado)
            assert (255, 255, 255, 255) not in {cerrado.getpixel(p) for p in distintos}


def test_el_parpadeo_deja_igual_una_cara_que_ya_tiene_los_ojos_cerrados():
    alegre = Image.open(os.path.join(KIT, 'abuela-familia', 'portrait-alegre.png')).convert('RGBA')
    assert list(da.parpadeo(alegre).getdata()) == list(alegre.getdata())


def test_las_letras_de_las_fichas_se_distinguen_de_un_vistazo():
    letras = {ch: da.letra(ch) for ch in 'ABCD'}
    for ch, im in letras.items():
        assert im.size == (7, 9), ch
        assert {a for *_, a in im.getdata()} <= {0, 255}
    lleno = {ch: {(x, y) for y in range(9) for x in range(7) if im.getpixel((x, y))[3]} for ch, im in letras.items()}
    for a in 'ABCD':
        for b in 'ABCD':
            if a < b:
                assert len(lleno[a] ^ lleno[b]) >= 12, (a, b, len(lleno[a] ^ lleno[b]))
    # la C queda abierta a la derecha (no es un 0) y la B tiene cintura (no es un 8)
    assert not any((x, y) in lleno['C'] for x in (5, 6) for y in range(2, 7))
    assert (6, 4) not in lleno['B'] and (0, 4) in lleno['B'] and all((0, y) in lleno['B'] for y in range(9))


def test_el_pulso_tiene_cuatro_cuadros_y_cada_estado_es_distinto():
    tiras = {estado: da.pulso(estado) for estado in da.PULSOS}
    for estado, tira in tiras.items():
        assert tira.size == (16 * 4, 8), estado
        assert {a for *_, a in tira.getdata()} <= {0, 255}
    assert len({tuple(t.getdata()) for t in tiras.values()}) == 3

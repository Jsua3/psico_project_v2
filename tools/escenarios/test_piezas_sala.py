"""Contratos de piezas_luz.py (luz entera), piezas_sala.py (componer_sala), piezas_hospital.py y piezas_catalogo.py."""
import copy
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import piezas_catalogo as pc  # noqa: E402
import piezas_geo as g  # noqa: E402
import piezas_hospital as ph  # noqa: E402
import piezas_luz as pl  # noqa: E402
import piezas_muro as pm  # noqa: E402
import piezas_puertas as pp  # noqa: E402
import piezas_sala as sl  # noqa: E402
import piezas_superficies as ps  # noqa: E402


def _sala(ancho=960, encuadre='tres-paredes', piezas=(), puertas=(), **estructura):
    return {'id': 'x', 'nombre': 'X', 'encuadre': encuadre, 'puertas': list(puertas),
            'estructura': dict(ancho=ancho, momento='dia', acabados=dict(piso='madera', muro='pintura', paleta='casa'), piezas=list(piezas),
                               **estructura)}


VENTANA = {'id': 'v', 'tipo': 'ventana', 'modelo': 'corrediza', 'muro': 'fondo', 'pos': 300}
TUBO = {'id': 't', 'tipo': 'lampara', 'modelo': 'tubo', 'muro': 'fondo', 'pos': 384}
PIE = {'id': 'l', 'tipo': 'lampara', 'modelo': 'pie', 'x': 300, 'y': 340}


# ── luz ────────────────────────────────────────────────────────────────────────

def test_las_tablas_son_las_de_la_renovacion_visual():
    assert (pl.MINIMO, pl.PASO, pl.NIVELES, pl.PENUMBRA) == (4400, 700, 8, 7900)
    assert pl.TABLA_AMBIENTE.shape == (9, 3)
    assert tuple(pl.TABLA_AMBIENTE[8]) == (255, 255, 255), 'a plena luz no se tiñe'
    assert pl.TABLA_AMBIENTE[0][2] > pl.TABLA_AMBIENTE[0][0], 'las sombras son frías'
    assert tuple(pl.TABLA_CALIDA[3]) == (38, 31, 21), 'tono cálido al 15 %'


@pytest.mark.parametrize('momento', ['dia', 'noche'])
def test_la_luz_es_entera_y_solo_usa_los_escalones(momento):
    sala = _sala(piezas=[VENTANA, TUBO, PIE])
    nivel, calido, frio = pl.niveles(sala, momento)
    for matriz, tope in ((nivel, 8), (calido, 3), (frio, 3)):
        assert matriz.dtype.kind == 'i' and matriz.shape == (g.ALTO, 960)
        assert matriz.min() >= 0 and matriz.max() <= tope
    ambiente, brillo = pl.calcular_luz(sala, momento)
    assert ambiente.size == brillo.size == (960, g.ALTO)
    tonos = {tuple(c) for c in np.unique(np.array(ambiente).reshape(-1, 3), axis=0)}
    assert tonos <= {tuple(int(v) for v in fila) for fila in pl.TABLA_AMBIENTE}


def test_sin_luces_la_sala_queda_en_penumbra_y_de_noche_mas_oscura():
    dia, noche = pl.niveles(_sala())[0], pl.niveles(_sala(), 'noche')[0]
    assert dia[380, 480] in (4, 5) and noche[380, 480] < dia[380, 480]


def test_de_dia_la_ventana_echa_su_haz_y_de_noche_no_emite():
    con, sin = _sala(piezas=[VENTANA]), _sala()
    assert pl.niveles(con, 'dia')[0].sum() > pl.niveles(sin, 'dia')[0].sum()
    assert pl.niveles(con, 'dia')[1].max() == 3
    for a, b in zip(pl.niveles(con, 'noche'), pl.niveles(sin, 'noche')):
        assert np.array_equal(a, b)


def test_mover_la_ventana_mueve_el_haz():
    def centro(pos):
        calido = pl.niveles(_sala(piezas=[dict(VENTANA, pos=pos)]), 'dia')[1]
        ys, xs = np.nonzero(calido[g.SEAM + 40:g.SEAM + 60])
        return xs.mean()
    assert centro(500) - centro(200) == pytest.approx(300 * (1 + g.K * 50 / g.FONDO), abs=6)


def test_una_ventana_lateral_ilumina_desde_su_muro():
    calido = pl.niveles(_sala(piezas=[dict(VENTANA, muro='izquierda', pos=150)]), 'dia')[1]
    assert calido[:, :480].sum() > 0 and calido[:, :480].sum() > 4 * calido[:, 480:].sum()
    sin_muro = pl.niveles(_sala(encuadre='una-pared', piezas=[dict(VENTANA, muro='izquierda', pos=150)]), 'dia')[1]
    assert sin_muro.sum() == 0


def test_de_noche_el_tubo_da_luz_fria_y_la_lampara_de_pie_calida():
    _, calido, frio = pl.niveles(_sala(piezas=[TUBO]), 'noche')
    assert frio.max() == 3 and calido.max() == 0
    _, calido, frio = pl.niveles(_sala(piezas=[PIE]), 'noche')
    assert calido[340, 300] == 3 and frio.max() == 0
    assert pl.niveles(_sala(piezas=[PIE]), 'dia')[1].max() == 0, 'de día está apagada'
    assert pl.niveles(_sala(piezas=[dict(PIE, encendida='siempre')]), 'dia')[1].max() > 0
    assert pl.niveles(_sala(piezas=[dict(PIE, encendida='nunca')]), 'noche')[1].max() == 0


def test_dos_luces_que_se_cruzan_no_rompen_los_escalones():
    una = pl.niveles(_sala(piezas=[PIE]), 'noche')[0]
    dos = pl.niveles(_sala(piezas=[PIE, dict(PIE, id='l2', x=380)]), 'noche')[0]
    assert dos.max() <= 8 and (dos >= una).all()


def test_la_puerta_abierta_deja_caer_una_cuna_de_luz():
    puerta = {'id': 'p', 'hacia': 'y', 'muro': 'fondo', 'pos': 400, 'modelo': 'madera'}
    cerrada = pl.niveles(_sala(puertas=[puerta]), 'noche')[0]
    abierta = pl.niveles(_sala(puertas=[puerta]), 'noche', abiertas=('p',))[0]
    assert abierta.sum() > cerrada.sum()
    assert (abierta != cerrada)[:, :380].sum() == 0, 'la cuña cae frente a la puerta'


@pytest.mark.parametrize('ancho', g.ANCHOS)
def test_la_luz_cubre_cualquier_ancho(ancho):
    ambiente, brillo = pl.calcular_luz(_sala(ancho, piezas=[VENTANA, TUBO]), 'noche')
    assert ambiente.size == (ancho, g.ALTO)


# ── componer_sala ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize('encuadre', g.ENCUADRES)
@pytest.mark.parametrize('ancho', (960, 1440, 1920))
def test_la_sala_se_arma_en_cualquier_encuadre_y_ancho(encuadre, ancho):
    im = sl.componer_sala(_sala(ancho, encuadre))
    assert im.size == (ancho, g.ALTO)
    px = np.array(sl.capas(_sala(ancho, encuadre))['fondo'])[:, :, :3]
    vacio = np.array(ps.VACIO, dtype=np.uint8)
    izq, der = g.laterales(encuadre)
    assert (px[400, 8] == vacio).all() == izq and (px[400, ancho - 9] == vacio).all() == der
    assert (px[20, ancho // 2] == vacio).all() and (px[400, ancho // 2] != vacio).any()


def test_una_sala_vacia_se_compone_igual():
    assert sl.capas(_sala())['sprites'] == [] and sl.capas(_sala())['avisos'] == []


def test_la_sala_de_muestra_no_tiene_avisos_y_trae_sus_piezas():
    c = sl.capas(sl.CASA_SALA)
    assert c['avisos'] == []
    assert {s['id'] for s in c['sprites']} == {'ventana', 'cuadro', 'repisa', 'reloj', 'lampara', 'puerta-comedor', 'puerta-escalera', 'puerta-fachada'}
    puerta = next(s for s in c['sprites'] if s['id'] == 'puerta-comedor')
    assert len(puerta['cuadros']) == 4 and puerta['capa'] == 'muro' and puerta['llegada'] == (200, 246)
    assert next(s for s in c['sprites'] if s['id'] == 'puerta-fachada')['capa'] == 'frente'


def test_la_ventana_y_la_lampara_cambian_de_cuadro_con_el_momento():
    dia, noche = sl.capas(sl.CASA_SALA, 'dia'), sl.capas(sl.CASA_SALA, 'noche')
    ventana = lambda c: next(s for s in c['sprites'] if s['id'] == 'ventana')  # noqa: E731
    assert (ventana(dia)['cuadro'], ventana(noche)['cuadro']) == (0, 1)


def test_las_piezas_mal_puestas_se_avisan_y_no_revientan():
    sala = _sala(encuadre='una-pared', piezas=[
        dict(VENTANA, id='sin-muro', muro='izquierda', pos=100),
        dict(VENTANA, id='fuera', pos=5000),
        {'id': 'rara', 'tipo': 'acuario', 'modelo': 'grande', 'muro': 'fondo', 'pos': 100},
        {'id': 'pie-sin-xy', 'tipo': 'lampara', 'modelo': 'pie', 'muro': 'fondo', 'pos': 100},
    ], puertas=[{'id': 'puerta-rara', 'hacia': 'y', 'muro': 'fondo', 'pos': 300, 'modelo': 'giratoria'}])
    c = sl.capas(sala)
    assert c['sprites'] == []
    assert len(c['avisos']) == 5 and all(any(n in a for a in c['avisos']) for n in ('sin-muro', 'fuera', 'rara', 'pie-sin-xy', 'puerta-rara'))
    assert sl.componer_sala(sala).size == (960, g.ALTO)


def test_una_pieza_en_el_extremo_del_muro_no_se_sale_del_lienzo():
    sala = _sala(encuadre='una-pared', piezas=[dict(VENTANA, pos=0), dict(VENTANA, id='v2', pos=960)])
    assert sl.capas(sala)['avisos'] == []
    assert sl.componer_sala(sala).size == (960, g.ALTO)


def test_un_ancho_fuera_del_catalogo_se_rechaza():
    with pytest.raises(ValueError, match='1000'):
        sl.componer_sala(_sala(1000))


def test_abrir_una_puerta_cambia_la_imagen():
    cerrada = np.array(sl.componer_sala(sl.CASA_SALA, con_luz=False))
    abierta = np.array(sl.componer_sala(sl.CASA_SALA, abiertas=('puerta-comedor',), con_luz=False))
    distintos = (cerrada != abierta).any(-1)
    assert distintos[:, 150:260].sum() > 500 and distintos[:, 400:].sum() == 0


def test_lo_que_cuelga_del_muro_le_echa_sombra():
    sin = np.array(sl.capas(_sala())['fondo'])
    con = np.array(sl.capas(_sala(piezas=[{'id': 'c', 'tipo': 'cuadro', 'modelo': 'cuadro', 'muro': 'fondo', 'pos': 300}]))['fondo'])
    assert (con[g.TOP:g.SEAM].astype(int).sum(-1) < sin[g.TOP:g.SEAM].astype(int).sum(-1)).sum() > 60
    assert np.array_equal(con[g.SEAM:], sin[g.SEAM:])


# ── hospital ───────────────────────────────────────────────────────────────────

def test_el_hospital_tiene_las_ocho_salas_del_diseno():
    assert [s['id'] for s in ph.SALAS] == ['entrada-urgencias', 'sala-espera', 'pasillo', 'triaje', 'estacion-enfermeria', 'sala-escucha',
                                           'trabajo-social', 'habitacion-recuperacion']
    assert ph.PASILLO['estructura']['ancho'] == 1680


def test_el_pasillo_tiene_una_puerta_por_sala_y_en_los_cuatro_muros():
    destinos = [p['hacia'] for p in ph.PASILLO['puertas']]
    assert sorted(destinos) == sorted(s['id'] for s in ph.SALAS if s['id'] != 'pasillo')
    assert {p['muro'] for p in ph.PASILLO['puertas']} == set(g.MUROS)


def test_toda_puerta_del_hospital_tiene_su_puerta_de_regreso():
    """OCL-15: lleva a una sala que existe y esa sala tiene la puerta recíproca."""
    salas = {s['id']: s for s in ph.SALAS}
    for sala in ph.SALAS:
        for p in sala['puertas']:
            vuelta = next(q for q in salas[p['hacia']]['puertas'] if q['id'] == p['par'])
            assert vuelta['hacia'] == sala['id'] and vuelta['par'] == p['id'] and vuelta['modelo'] == p['modelo']


@pytest.mark.parametrize('sala', ph.SALAS, ids=lambda s: s['id'])
def test_cada_sala_del_hospital_se_arma_sin_avisos(sala):
    c = sl.capas(sala)
    assert c['avisos'] == []
    x0, y0, w, h = c['zona']
    for m in sala['muebles'] + sala['personajes']:
        assert x0 <= m['x'] <= x0 + w and y0 <= m['y'] <= y0 + h, m
    for s in c['sprites']:
        if s['tipo'] == 'puerta':
            x, y = s['llegada']
            assert x0 <= x <= x0 + w and y0 <= y <= y0 + h
    assert ph.componer(sala, 'noche').size == (sala['estructura']['ancho'], g.ALTO)


@pytest.mark.parametrize('sala', ph.SALAS, ids=lambda s: s['id'])
def test_las_piezas_de_un_mismo_muro_no_se_solapan(sala):
    """OCL-14 con la franja de altura: 8 px de holgura, 16 si una es puerta."""
    datos = pc.generar()[0]['piezas']
    ocupadas = [(p['muro'], p['pos'], datos['puerta/' + p['modelo']], True, p['id']) for p in sala['puertas']]
    ocupadas += [(p['muro'], p['pos'], datos[p['tipo'] + '/' + p['modelo']], False, p['id']) for p in sala['estructura']['piezas'] if 'muro' in p]
    for i, (muro_a, pos_a, fa, puerta_a, id_a) in enumerate(ocupadas):
        for muro_b, pos_b, fb, puerta_b, id_b in ocupadas[i + 1:]:
            if muro_a != muro_b or fa['franja'][1] <= fb['franja'][0] or fb['franja'][1] <= fa['franja'][0]:
                continue
            holgura = 16 if (puerta_a and puerta_b) else 0
            assert abs(pos_a - pos_b) >= (fa['ocupa'] + fb['ocupa']) / 2 - 8 + holgura, (sala['id'], id_a, id_b)


def test_de_noche_el_hospital_se_alumbra_con_tubos_y_la_sala_de_escucha_con_luz_calida():
    _, calido, frio = pl.niveles(ph.PASILLO, 'noche')
    assert frio.max() == 3 and calido.max() == 0
    _, calido, frio = pl.niveles(ph.ESCUCHA, 'noche')
    assert calido.max() == 3 and frio.max() == 0


def test_el_mobiliario_nuevo_del_hospital_cumple_el_contrato():
    assert ph.NUEVOS == ['camilla', 'cama-recuperacion', 'monitor', 'portasuero', 'silla-ruedas', 'cortina', 'mostrador-enfermeria',
                         'carro-curaciones', 'sillas-espera', 'maquina-cafe', 'dispensador-agua', 'archivador-clinico']
    for ref in ph.NUEVOS:
        cuadros = ph.mueble(ref)
        px = np.array(cuadros[0])
        assert set(np.unique(px[:, :, 3])) <= {0, 255}, ref
        assert len(np.unique(px[px[:, :, 3] == 255][:, :3], axis=0)) <= 24, ref
        assert px[-1, :, 3].any(), ref + ': se apoya en el borde inferior'
    for ref in ('monitor', 'cortina', 'maquina-cafe'):
        cuadros = ph.mueble(ref)
        assert len(cuadros) == 4 and ph.MUEBLES[ref]['fps'] > 0
        assert len({np.array(c).tobytes() for c in cuadros}) >= 2, ref + ' se mueve'


# ── manifiesto de piezas ───────────────────────────────────────────────────────

def test_el_manifiesto_declara_cada_pieza_con_su_contrato():
    datos, imagenes = pc.generar()
    assert datos['esquema'] == 2
    assert len([c for c in datos['piezas'] if c.startswith('puerta/')]) == 7
    assert len(datos['pisos']) == 12 and len(datos['muros']) == 20
    for clave, ficha in datos['piezas'].items():
        assert ficha['ocupa'] % 8 == 0 and ficha['muros'] and ficha['cuadros'] >= 1 and len(ficha['franja']) == 2, clave
        vistas = ficha['vistas']
        planas = [v for k, v in vistas.items() if k != 'lado'] + list(vistas.get('lado', {}).values())
        for v in planas:
            im = imagenes[v['ruta']]
            assert im.size == (v['ancho'] * ficha['cuadros'], v['alto']) and len(v['apoyo']) == 2, v['ruta']
        if 'lado' in vistas:
            assert sorted(vistas['lado']) == sorted(str(a) for a in g.ANCHOS)
    assert datos['piezas']['puerta/corrediza']['vistas'].keys() == {'frente', 'camara', 'lado'}
    assert datos['piezas']['ventana/corrediza']['luz'] == pm.PIEZAS[('ventana', 'corrediza')]['luz']
    assert datos['piezas']['lampara/tubo']['luz']['forma'] == 'tubo' and 'luz' not in datos['piezas']['cuadro/cuadro']
    assert datos['piezas']['lampara/tubo']['franja'][0] > datos['piezas']['puerta/madera']['franja'][1], 'el tubo va por encima de la puerta'
    assert set(datos['piezas']['puerta/madera']['muros']) == set(g.MUROS) and len(pp.MODELOS) == 7


def test_el_catalogo_versionado_esta_al_dia():
    assert pc.verificar() == []


def test_el_manifiesto_general_no_incluye_las_piezas():
    import manifiesto
    assert manifiesto.generar()['esquema'] == 1
    assert not any(ruta.startswith('piezas/') for ruta in manifiesto.generar()['sprites'])
    assert manifiesto.verificar()


def test_la_estructura_no_se_modifica_al_componer():
    antes = copy.deepcopy(sl.CASA_SALA)
    sl.componer_sala(sl.CASA_SALA, 'noche', abiertas=('puerta-comedor',))
    assert sl.CASA_SALA == antes


# ── conversión de las 28 salas ─────────────────────────────────────────────────

import json  # noqa: E402

import piezas_convertir as cv  # noqa: E402

CONVERTIDOS = {lugar: cv._json(cv.convertir_lugar(lugar)) for lugar in cv.LUGARES}
CONVERTIDAS = [(lugar, sala) for lugar, datos in CONVERTIDOS.items() for sala in datos['salas']]


def test_se_convierten_las_28_salas():
    assert {lugar: len(datos['salas']) for lugar, datos in CONVERTIDOS.items()} == {'universidad': 10, 'casa': 9, 'comisaria': 9}
    assert all(datos['esquema'] == 3 for datos in CONVERTIDOS.values())


@pytest.mark.parametrize('lugar, sala', CONVERTIDAS, ids=lambda v: v if isinstance(v, str) else v['id'])
def test_cada_sala_convertida_se_arma_sin_avisos(lugar, sala):
    assert 'fondo' not in sala and sala['estructura']['ancho'] == 960
    acabados = sala['estructura']['acabados']
    assert acabados['piso'] in ps.PISOS and acabados['muro'] in ps.ACABADOS and acabados['paleta'] in ps.PALETAS
    c = sl.capas(sala)
    assert c['avisos'] == []
    assert sum(s['tipo'] == 'puerta' for s in c['sprites']) == len(sala['puertas']) >= 1
    assert sl.componer_sala(sala, 'noche').size == (960, g.ALTO)


@pytest.mark.parametrize('lugar', cv.LUGARES)
def test_las_puertas_convertidas_son_reciprocas_y_del_mismo_modelo(lugar):
    salas = {s['id']: s for s in CONVERTIDOS[lugar]['salas']}
    for sala in salas.values():
        izq, der = g.laterales(sala['encuadre'])
        for p in sala['puertas']:
            assert p['pos'] % g.REJILLA == 0 and p['modelo'] in pp.MODELOS
            assert p['muro'] in ('fondo', 'camara') or (izq if p['muro'] == 'izquierda' else der), 'toda puerta tiene su muro'
            if p.get('sentidoUnico'):
                continue
            vuelta = next(q for q in salas[p['hacia']]['puertas'] if q['id'] == p['par'])
            assert vuelta['hacia'] == sala['id'] and vuelta['modelo'] == p['modelo'], (sala['id'], p['id'])


@pytest.mark.parametrize('lugar, sala', CONVERTIDAS, ids=lambda v: v if isinstance(v, str) else v['id'])
def test_en_una_sala_convertida_nada_se_solapa(lugar, sala):
    puestas = [dict(tipo='puerta', modelo=p['modelo'], muro=p['muro'], pos=p['pos']) for p in sala['puertas']] + sala['estructura']['piezas']
    for i, a in enumerate(puestas):
        for b in puestas[i + 1:]:
            assert not cv._chocan(a, b), (sala['id'], a, b)


@pytest.mark.parametrize('lugar', cv.LUGARES)
def test_los_lugares_convertidos_versionados_estan_al_dia(lugar):
    with open(os.path.join(pc.BIBLIOTECA, 'piezas', 'lugares', lugar + '.json'), encoding='utf-8') as f:
        assert json.load(f) == CONVERTIDOS[lugar]

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
    tabla = pl.TABLA_AMBIENTE_NOCHE if momento == 'noche' else pl.TABLA_AMBIENTE
    assert tonos <= {tuple(int(v) for v in fila) for fila in tabla}


def test_sin_luces_la_sala_queda_en_penumbra_y_de_noche_mas_oscura():
    dia, noche = pl.niveles(_sala())[0], pl.niveles(_sala(), 'noche')[0]
    assert dia[380, 480] in (4, 5) and noche[380, 480] < dia[380, 480]


def test_de_dia_la_ventana_echa_su_haz_y_de_noche_deja_entrar_la_luna():
    con, sin = _sala(piezas=[VENTANA]), _sala()
    sol = pl.niveles(con, 'dia')[0] - pl.niveles(sin, 'dia')[0]
    assert sol.sum() > 0 and pl.niveles(con, 'dia')[1].max() == 3
    nivel, calido, frio = pl.niveles(con, 'noche')
    luna = nivel - pl.niveles(sin, 'noche')[0]
    assert luna.sum() > 0, 'de noche el piso lejos de las lámparas no queda parejo'
    assert calido.max() == 0 and frio.max() == 1, 'la luna es fría y apenas tiñe'
    assert luna.max() <= 2 < sol.max(), 'y es mucho más débil que el sol'
    apagada = _sala(piezas=[dict(VENTANA, encendida=False)])
    for a, b in zip(pl.niveles(apagada, 'noche'), pl.niveles(sin, 'noche')):
        assert np.array_equal(a, b), 'una ventana tapada no deja entrar nada'


def test_el_vidrio_de_una_puerta_cerrada_se_refleja_solo_en_el_piso_pulido():
    def frio(piso, modelo='vidrio', abiertas=()):
        puerta = dict(id='p', hacia='y', muro='fondo', pos=384, modelo=modelo, etiqueta='Pasar')
        sala = _sala(puertas=[puerta])
        sala['estructura']['acabados']['piso'] = piso
        return pl.niveles(sala, 'dia', abiertas=abiertas)[2]
    pulido = frio('vinilo')
    ys, xs = np.nonzero(pulido)
    assert 1 <= pulido.max() <= 2, 'reflejo suave: nunca a plena fuerza'
    assert ys.min() >= g.SEAM and ys.max() <= g.SEAM + 70, 'cae en el piso, al pie de la puerta, y se apaga pronto'
    assert abs(xs.mean() - (g.borde(960) + 384)) < 4, 'justo bajo la puerta'
    assert frio('madera').max() == 0, 'la madera no devuelve la luz'
    assert frio('vinilo', modelo='metalica').max() == 0, 'una puerta sin vidrio no refleja'
    assert frio('vinilo', abiertas=('p',)).max() == 0, 'abierta, lo que cae es la cuña cálida de la sala vecina'
    assert set(pl.VIDRIADAS) <= set(pp.MODELOS)


def test_los_tubos_del_hospital_alumbran_tambien_de_dia_y_el_dia_sigue_siendo_mas_claro():
    for sala in ph.SALAS:
        tubos = [p for p in sala['estructura']['piezas'] if p['modelo'] == 'tubo']
        assert all(p.get('encendida') is True for p in tubos), sala['id']
        dia, noche = pl.niveles(sala, 'dia')[0], pl.niveles(sala, 'noche')[0]
        assert dia.mean() > noche.mean() + 1, f"{sala['id']}: el día y la noche se distinguen de un vistazo"
        if tubos:
            apagada = copy.deepcopy(sala)
            for p in apagada['estructura']['piezas']:
                p.pop('encendida', None)
            assert dia.sum() > pl.niveles(apagada, 'dia')[0].sum(), sala['id']


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
    assert pl.niveles(_sala(piezas=[dict(PIE, encendida=True)]), 'dia')[1].max() > 0
    assert pl.niveles(_sala(piezas=[dict(PIE, encendida=False)]), 'noche')[1].max() == 0


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
    assert len(puerta['cuadros']) == 4 and puerta['capa'] == 'muro' and puerta['llegada'] == (200, 260)
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
    assert calido.max() == 3 and frio.max() == 1, 'de frío solo entra la luna por la ventana, apenas'


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
    assert len(datos['pisos']) == 12 + 28 and len(datos['muros']) == 20 + 28, 'el catálogo más el piso y el muro propios de cada sala'
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
    assert datos['piezas']['ventana/corrediza']['luz'] == dict(pm.PIEZAS[('ventana', 'corrediza')]['luz'], antepecho=70, alto=60)
    assert datos['piezas']['puerta/corrediza']['ancho'] == 136, 'el vano: lo usa la cuña de luz de la puerta abierta'
    assert datos['luz']['tablaAmbiente'] == pl.TABLA_AMBIENTE.tolist() and datos['luz']['minimo'] == 4400
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
NATIVAS = {lugar: {s['id'] for s in __import__(modulo).SALAS} for lugar, modulo in cv.NATIVAS.items()}


def test_se_convierten_las_28_salas():
    assert {lugar: len(datos['salas']) for lugar, datos in CONVERTIDOS.items()} == {'universidad': 10, 'casa': 9, 'comisaria': 9}
    assert all(datos['esquema'] == 3 for datos in CONVERTIDOS.values())


@pytest.mark.parametrize('lugar, sala', CONVERTIDAS, ids=lambda v: v if isinstance(v, str) else v['id'])
def test_cada_sala_convertida_se_arma_sin_avisos(lugar, sala):
    assert 'fondo' not in sala and sala['estructura']['ancho'] in (g.ANCHOS if sala['id'] in NATIVAS.get(lugar, ()) else (960,))
    acabados = sala['estructura']['acabados']
    assert acabados['piso'] in ps.PISOS and acabados['muro'] in ps.ACABADOS and acabados['paleta'] in ps.PALETAS
    c = sl.capas(sala)
    assert c['avisos'] == []
    assert sum(s['tipo'] == 'puerta' for s in c['sprites']) == len(sala['puertas']) >= 1
    assert sl.componer_sala(sala, 'noche').size == (sala['estructura']['ancho'], g.ALTO)


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
    puestas = [dict(tipo='puerta', modelo=p['modelo'], muro=p['muro'], pos=p['pos']) for p in sala['puertas']]
    puestas += [p for p in sala['estructura']['piezas'] if 'muro' in p]       # las lámparas de pie van en el piso
    for i, a in enumerate(puestas):
        for b in puestas[i + 1:]:
            assert not cv._chocan(a, b), (sala['id'], a, b)


@pytest.mark.parametrize('lugar', cv.LUGARES)
def test_los_lugares_convertidos_versionados_estan_al_dia(lugar):
    with open(os.path.join(pc.BIBLIOTECA, 'piezas', 'lugares', lugar + '.json'), encoding='utf-8') as f:
        assert json.load(f) == CONVERTIDOS[lugar]


# ── sombras proyectadas: la silueta de quien las arroja ─────────────────────────

SOFA = pl.cuerpo(430, 330, 88, 44)


def _barras(x=430, y=330, alto=40):
    """Un cuerpo con dos barras de 4 px separadas por un hueco de 8: si la sombra es su silueta, el hueco se ve."""
    mascara = np.zeros((alto, 16), dtype=bool)
    mascara[:, :4] = mascara[:, 12:] = True
    return pl.cuerpo(x, y, 16, alto, mascara=mascara, apoyo=(8, alto))


def _en_el_piso(c, m, u, h):
    a, b, cc, d = m
    return c['x'] + (a * u + b * h) // 64, c['y'] + (cc * u + d * h) // 64


def test_un_cuerpo_tiene_su_huella_centrada_en_el_apoyo():
    assert SOFA == dict(x0=388, x1=472, y0=314, y1=330, alto=36)
    assert pl.cuerpo(500, 400, 48, 72, persona=True) == dict(x0=491, x1=509, y0=390, y1=400, alto=60)


def test_cuerpo_de_toma_la_silueta_del_alfa_y_apoya_la_sombra_en_los_pies():
    from PIL import Image
    im = Image.new('RGBA', (48, 72), (0, 0, 0, 0))
    im.paste((90, 60, 40, 255), (18, 6, 30, 66))
    c = pl.cuerpo_de(im, 100, 300, pie=(124, 368))
    assert (c['x'], c['y'], c['px'], c['py'], c['alto']) == (124, 366, 24, 66, 60), 'nace en la fila siguiente a la última opaca'
    assert c['mascara'].shape == (72, 48) and c['mascara'].sum() == 12 * 60
    assert (c['x0'], c['x1']) == (115, 133), 'la huella de una persona sigue siendo la de sus pies'
    assert pl.cuerpo_de_json(pl.cuerpo_a_json(c))['mascara'].tolist() == c['mascara'].tolist()


def test_la_sombra_es_la_silueta_tendida_en_la_direccion_del_haz():
    sala, c = _sala(piezas=[VENTANA]), _barras()
    sombra = pl.sombras(sala, 'dia', cuerpos=[c])
    m = pl.matrices_de_sombra(sala, 'dia', [(c['x'], c['y'])], alto=c['alto'])[0]
    assert sombra.sum() > 150
    for u in (-6, 5):                          # las dos barras, a media altura: en sombra
        assert sombra[_en_el_piso(c, pl._vista_desde(c, pl.MATRIZ_HAZ['fondo'], *pl.SENOS_HAZ['fondo']), u, 20)[::-1]]
    hueco = _en_el_piso(c, pl._vista_desde(c, pl.MATRIZ_HAZ['fondo'], *pl.SENOS_HAZ['fondo']), 0, 20)
    assert not sombra[hueco[::-1]], 'entre las barras pasa la luz: no es una mancha ni un rectángulo'
    ys, xs = np.nonzero(sombra)
    assert ys.min() >= c['y'] - 4 and xs.mean() > c['x'], 'cae hacia la cámara y hacia la derecha, como viaja el haz'


def test_la_sombra_de_una_persona_sale_del_cuadro_que_se_ve():
    sala = _sala(piezas=[VENTANA])
    quieta, otra = _barras(), _barras()
    otra['mascara'] = quieta['mascara'].copy()
    otra['mascara'][:20, :] = False             # el mismo cuerpo, agachado: otro cuadro de animación
    a, b = pl.sombras(sala, 'dia', cuerpos=[quieta]), pl.sombras(sala, 'dia', cuerpos=[otra])
    assert b.sum() < a.sum() and not (b & ~a).any(), 'cambia el cuadro, cambia la sombra'


def test_la_sombra_no_se_dibuja_sobre_el_propio_cuerpo_ni_sobre_el_muro():
    sala, c = _sala(piezas=[VENTANA]), _barras(y=g.SEAM + 6)
    sombra = pl.sombras(sala, 'dia', cuerpos=[c])
    assert not sombra[:g.SEAM].any(), 'se corta donde empieza el muro'
    assert not (sombra & pl._dibujo(pl._Sala(sala), c)).any()


def test_la_lampara_arroja_la_silueta_lejos_de_si_misma_y_mas_larga_cuanto_mas_baja():
    def sombra(altura):
        lampara = dict(PIE, x=250, y=330)
        sala = _sala(piezas=[lampara])
        pm.PIEZAS[('lampara', 'pie')]['luz']['altura'], antes = altura, pm.PIEZAS[('lampara', 'pie')]['luz']['altura']
        try:
            return pl.sombras(sala, 'noche', cuerpos=[_barras(x=330, y=330)])
        finally:
            pm.PIEZAS[('lampara', 'pie')]['luz']['altura'] = antes
    alta, baja = sombra(150), sombra(70)
    ys, xs = np.nonzero(alta)
    assert len(xs) > 60 and xs.mean() > 330, 'lejos de la lámpara, que está a la izquierda'
    assert np.nonzero(baja)[1].max() > xs.max(), 'la lámpara más baja la estira'


def test_bajo_el_tubo_la_sombra_es_corta_y_casi_debajo():
    sala, c = _sala(piezas=[TUBO]), _barras(x=480, y=380)
    ys, xs = np.nonzero(pl.sombras(sala, 'noche', cuerpos=[c]))
    assert len(xs) > 0
    assert np.abs(xs - c['x']).max() <= 16 and np.abs(ys - c['y']).max() <= c['alto'] * 3 // 8 + 4
    assert pl.EN_SOMBRA['tubo'] < pl.EN_SOMBRA['pozo'], 'la luz del tubo es difusa: su sombra es más clara'


def test_las_direcciones_son_dieciseis_y_la_sombra_no_tiembla():
    assert [pl.direccion(dx, dy) for dx, dy in ((9, 0), (9, 9), (0, 9), (-9, 9), (-9, 0), (-9, -9), (0, -9), (9, -9))] == [0, 2, 4, 6, 8, 10, 12, 14]
    assert len({pl.direccion(int(100 * np.cos(t)), int(100 * np.sin(t))) for t in np.linspace(0, 6.28, 400)}) == 16
    lampara = dict(PIE, x=250, y=330)
    matrices = pl.matrices_de_sombra(_sala(piezas=[lampara]), 'noche', [(x, 330) for x in range(300, 324, 2)])
    assert all(m[0] == 0 and m[1] > 0 and m[3] == 0 for m in matrices), 'pasos cortos: la misma dirección'
    assert len({tuple(m) for m in matrices}) <= 3, 'y el largo cambia por octavos, no a cada píxel'
    for i in range(16):
        for k8 in (2, 3, 8, 12):
            a, b, c, d = pl.matriz_de(i, k8)
            assert a * d - b * c != 0


def test_manda_la_fuente_que_mas_luz_da_y_sin_ninguna_la_sombra_es_cenital():
    sala = _sala(piezas=[VENTANA, dict(PIE, x=700, y=420)])
    en_el_haz, junto_a_la_lampara = pl.matrices_de_sombra(sala, 'dia', [(430, 330)])[0], pl.matrices_de_sombra(sala, 'noche', [(760, 420)])[0]
    assert en_el_haz[1] > 0 and en_el_haz[3] > 0, 'el haz del fondo tiende la sombra hacia la derecha y la cámara'
    assert junto_a_la_lampara[1] > 0 and junto_a_la_lampara[3] == 0, 'a la derecha de la lámpara, hacia la derecha'
    assert pl.matrices_de_sombra(_sala(), 'noche', [(480, 400)])[0] == pl._vista_desde(
        pl.cuerpo(480, 400, 48, 72, persona=True), pl.matriz_de(*pl.CENITAL), 2 * abs(pl.DIRECCIONES[4][1]), abs(pl.DIRECCIONES[4][0]))


def test_al_aire_libre_el_sol_arroja_sombra():
    sala = _sala(encuadre='una-pared', exterior=True)
    libre, tapada = pl.niveles(sala, 'dia')[0], pl.niveles(sala, 'dia', cuerpos=[SOFA])[0]
    assert (libre > tapada).sum() > 300 and (libre - tapada).max() >= pl.SOMBRA_AL_SOL


def test_la_referencia_de_luz_esta_congelada():
    """Seis salas, de día y de noche: lo versionado es exactamente lo que calcula piezas_luz.py."""
    import piezas_luz_referencia as lr
    datos, imagenes = lr.generar()
    assert [c['id'] for c in datos['casos']] == ['casa-sala', 'hospital-pasillo', 'hospital-sala-escucha', 'hospital-entrada', 'casa-fachada', 'ancha-1920']
    assert len(imagenes) == 24
    assert lr.verificar() == []


# ── forma del haz, reflejos del piso, sombra de contacto y noche ───────────────

def test_la_noche_enfria_las_sombras_mas_que_el_dia():
    dia, noche = pl.TABLA_AMBIENTE, pl.TABLA_AMBIENTE_NOCHE
    assert tuple(noche[8]) == (255, 255, 255) and all(noche[n][0] < dia[n][0] and noche[n][2] >= dia[n][2] for n in range(8))


def test_el_haz_lleva_la_forma_de_la_ventana():
    def haz(modelo):
        return pl.niveles(_sala(piezas=[dict(VENTANA, modelo=modelo, pos=384)]), 'dia')[1]
    corrediza, persiana = haz('corrediza'), haz('persiana')
    fila = corrediza[g.SEAM + 60]                               # un corte a lo ancho: luz, parteluz, luz
    lleno = np.nonzero(fila == 3)[0]
    assert len(lleno) > 40 and (np.diff(lleno) > 6).sum() == 1, 'un parteluz vertical parte el haz en dos'
    columna = persiana[g.SEAM + 100:g.SEAM + 215, int(np.nonzero(persiana[g.SEAM + 150])[0].mean()) - 30]
    assert (np.diff(columna.astype(int)) != 0).sum() >= 12, 'las lamas de la persiana rayan el haz'
    assert pm.PIEZAS[('ventana', 'ventanal')]['luz']['parteluces'] == dict(verticales=[244, 500, 756], horizontales=[652])


def test_un_piso_pulido_devuelve_la_luz_al_pie_del_muro():
    def brillo(piso, momento, piezas):
        sala = _sala(piezas=piezas)
        sala['estructura']['acabados']['piso'] = piso
        return pl.niveles(sala, momento)
    zona = (slice(g.SEAM + 3, g.SEAM + 14), slice(96 + 384 - 20, 96 + 384 + 20))
    assert brillo('vinilo', 'noche', [TUBO])[2][zona].sum() > brillo('madera', 'noche', [TUBO])[2][zona].sum()
    lejos = (slice(g.SEAM + 3, g.SEAM + 14), slice(600, 700))
    assert brillo('vinilo', 'dia', [dict(VENTANA, pos=560)])[1][lejos].sum() > brillo('madera', 'dia', [dict(VENTANA, pos=560)])[1][lejos].sum()


def test_la_sombra_de_contacto_va_en_la_luz_debajo_de_la_proyectada():
    libre, con = pl.niveles(_sala(), 'dia')[0], pl.niveles(_sala(), 'dia', cuerpos=[SOFA])[0]
    ys, xs = np.nonzero(libre - con >= pl.CONTACTO)
    assert len(xs) > 200 and SOFA['x0'] - 6 <= xs.min() and xs.max() <= SOFA['x1'] + 6, 'pequeña y a los pies'
    assert (libre - con).max() <= pl.CONTACTO + pl.SOMBRA_PROPIA + 1 and (con > libre).sum() == 0


# ── luz propia y objetos redibujados ───────────────────────────────────────────

def _cuadrado(color, lado=12):
    from PIL import Image
    return Image.new('RGBA', (lado, lado), color + (255,))


def test_lo_que_emite_luz_propia_se_pinta_encima_de_la_luz_y_lo_que_esta_delante_lo_tapa():
    from PIL import Image
    pantalla = (20, 240, 90)
    emisivo = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
    emisivo.paste(pantalla + (255,), (4, 4, 8, 8))
    cosa = dict(im=_cuadrado((200, 200, 200)), x=474, y=380, z=392, sombra=False, emisivo=emisivo)
    escena = sl.componer_sala(_sala(), 'noche', extras=[cosa]).convert('RGB')
    assert escena.getpixel((479, 385)) == pantalla, 'la pantalla conserva su color aunque la sala esté a oscuras'
    r, v, a = escena.getpixel((475, 381))
    assert max(r, v, a) < 200, 'el resto del objeto sí se oscurece con la sala'
    delante = dict(im=_cuadrado((90, 60, 40)), x=474, y=380, z=400, sombra=False)
    tapada = sl.componer_sala(_sala(), 'noche', extras=[cosa, delante]).convert('RGB')
    assert tapada.getpixel((479, 385)) != pantalla, 'lo que está delante tapa la pantalla'


def test_las_piezas_del_catalogo_con_emisivo_lo_llevan_a_las_capas():
    con = [s for s in sl.capas(ph.HABITACION, 'noche')['sprites'] if s.get('emisivos')]
    for s in con:
        assert len(s['emisivos']) in (1, len(s['cuadros'])) and s['emisivos'][0].size == s['cuadros'][0].size, s['id']
    assert all(m.get('emisivos') is None or len(m['emisivos']) == len(m['cuadros']) for m in ph.muebles_de(ph.HABITACION))
    assert any(m.get('emisivos') for m in ph.muebles_de(ph.HABITACION)), 'el monitor de signos alumbra por su cuenta'


def test_la_sala_de_la_casa_usa_los_muebles_y_objetos_que_redibujo_o1():
    import piezas_vista as pv
    lista = pv.muebles_de_biblioteca('casa', 'sala')
    nuevas = [m for m in lista if 'cuadros' in m]
    assert len(nuevas) >= 4, 'sofá, sillón, mesa de centro y televisor salen del catálogo nuevo'
    for m in nuevas:
        assert m['im'] is m['cuadros'][0] and (m['fps'] > 0) == (len(m['cuadros']) > 1), m['ref']
        for clave in ('mapas', 'emisivos'):
            assert m[clave] is None or [c.size for c in m[clave]] == [c.size for c in m['cuadros']], (m['ref'], clave)
    tele = next(m for m in lista if m.get('resplandor'))
    r = tele['resplandor']
    assert tele['emisivos'] and r['tira'].size == (r['w'] * r['n'], r['h']) and max(r['seq']) <= r['n']
    assert pv.muebles_de_biblioteca('casa', 'sala', dx=240)[0]['x'] == lista[0]['x'] + 240


# ── comisaría por piezas ───────────────────────────────────────────────────────

import piezas_comisaria as pco  # noqa: E402


def test_la_comisaria_trae_por_piezas_las_cuatro_salas_del_capitulo_3_y_conserva_las_demas():
    salas = {s['id']: s for s in CONVERTIDOS['comisaria']['salas']}
    assert NATIVAS['comisaria'] == {'recepcion', 'sala-espera', 'pasillo', 'consultorio-psicosocial'}
    for s in pco.SALAS:
        assert salas[s['id']] == json.loads(json.dumps(s)), 'en comisaria.json va la sala nativa, no la convertida'
        assert 'convertidaDe' not in salas[s['id']] and 'propios' not in s['estructura'], 'nada de capas fijas del arte viejo'
    assert all(salas[i].get('convertidaDe') for i in salas if i not in NATIVAS['comisaria'])


@pytest.mark.parametrize('sala', pco.SALAS, ids=lambda s: s['id'])
def test_cada_sala_de_la_comisaria_usa_el_arte_de_o1_y_proyecta_sus_sombras(sala):
    assert all(pco._ficha(m['ref']) for m in sala['muebles'] + sala['objetos']), 'todo mueble y objeto sale del catálogo de O1'
    muebles = pco.muebles_de(sala)
    assert any(m.get('persona') for m in muebles) and sum(1 for m in muebles if m.get('sombra')) >= 3
    puestas = [dict(tipo='puerta', modelo=p['modelo'], muro=p['muro'], pos=p['pos']) for p in sala['puertas']] + \
              [p for p in sala['estructura']['piezas'] if 'muro' in p]
    assert not any(cv._chocan(a, b) for i, a in enumerate(puestas) for b in puestas[i + 1:])
    assert any(p['tipo'] == 'ventana' for p in sala['estructura']['piezas']), 'de día entra luz: el día y la noche se distinguen'
    cuerpos = sl.cuerpos_de([dict(im=m['im'], x=m['x'] - m['im'].width // 2, y=m['y'] - m['im'].height, sombra=m.get('sombra', True) and not m.get('persona'),
                                  pie=(m['x'], m['y']) if m.get('persona') else None) for m in muebles])
    assert pl.sombras(sala, 'dia', cuerpos=cuerpos).sum() > 500


def test_en_la_vista_previa_las_salas_de_la_comisaria_no_chocan_con_las_del_hospital():
    import piezas_vista as pv
    ids = [s['id'] for _, salas in pv.lugares() for s, _ in salas]
    assert len(ids) == len(set(ids)) and 'comisaria-pasillo' in ids
    pasillo = next(s for _, salas in pv.lugares() for s, _ in salas if s['id'] == 'comisaria-pasillo')
    assert {p['hacia'] for p in pasillo['puertas']} == {'comisaria-sala-espera', 'comisaria-recepcion', 'comisaria-consultorio-psicosocial', None}

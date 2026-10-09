"""Pruebas del iterador de nodos (P-09, patrón Iterator). Sin base de datos."""
from types import SimpleNamespace

import pytest

from apps.simulation.services.node_iterator import BreadthFirstNodeIterator


def _n(id_, start=False):
    return SimpleNamespace(id=id_, start_node=start)


def _ids(nodes, edges):
    return [n.id for n in BreadthFirstNodeIterator(nodes, edges)]


def test_cumple_el_protocolo_de_iteracion():
    it = BreadthFirstNodeIterator([_n(1, True)], [])
    assert iter(it) is it
    assert next(it).id == 1
    with pytest.raises(StopIteration):
        next(it)
    with pytest.raises(StopIteration):  # agotado sigue agotado
        next(it)


def test_grafo_vacio_no_produce_nodos():
    assert _ids([], []) == []


def test_recorre_por_niveles_no_en_profundidad():
    nodes = [_n(1, True), _n(2), _n(3), _n(4), _n(5)]
    edges = [(1, 2), (1, 3), (2, 4), (3, 5)]
    assert _ids(nodes, edges) == [1, 2, 3, 4, 5]
    # en profundidad saldría 1,2,4,3,5: el orden de las aristas importa dentro del nivel
    assert _ids(nodes, [(1, 3), (1, 2), (2, 4), (3, 5)]) == [1, 3, 2, 5, 4]


def test_ciclo_no_repite_ni_cuelga():
    nodes = [_n(1, True), _n(2), _n(3)]
    assert _ids(nodes, [(1, 2), (2, 3), (3, 1), (2, 2)]) == [1, 2, 3]


def test_nodo_alcanzable_por_dos_caminos_sale_una_vez_en_su_primera_aparicion():
    nodes = [_n(1, True), _n(2), _n(3), _n(4)]
    assert _ids(nodes, [(1, 2), (1, 3), (2, 4), (3, 4)]) == [1, 2, 3, 4]


def test_inalcanzables_al_final_por_id():
    nodes = [_n(1, True), _n(2), _n(7), _n(8)]
    # 8 -> 7 no se sigue porque ni 7 ni 8 se alcanzan desde el inicio
    assert _ids(nodes, [(1, 2), (8, 7)]) == [1, 2, 7, 8]


def test_sin_nodo_inicial_marcado_empieza_por_el_primero():
    nodes = [_n(4), _n(5), _n(6)]
    assert _ids(nodes, [(4, 6)]) == [4, 6, 5]


def test_con_varios_marcados_como_inicio_gana_el_primero_por_id():
    nodes = [_n(1), _n(2, True), _n(3, True)]
    assert _ids(nodes, []) == [2, 1, 3]


def test_arista_a_nodo_ajeno_se_recorre_pero_no_se_emite():
    nodes = [_n(1, True), _n(3)]
    # el id 2 no está en los nodos del caso: no sale, pero tampoco rompe ni oculta a 3
    assert _ids(nodes, [(1, 2), (2, 3)]) == [1, 3]


def test_es_perezoso_consume_de_a_un_nodo():
    nodes = [_n(1, True), _n(2), _n(3)]
    it = BreadthFirstNodeIterator(nodes, [(1, 2), (2, 3)])
    assert next(it).id == 1
    assert next(it).id == 2
    assert [n.id for n in it] == [3]


def test_no_modifica_las_colecciones_recibidas():
    nodes = [_n(1, True), _n(2)]
    edges = [(1, 2)]
    list(BreadthFirstNodeIterator(nodes, edges))
    assert [n.id for n in nodes] == [1, 2] and edges == [(1, 2)]

"""Iterador del recorrido de nodos del caso (patrón Iterator, GoF).

Antes, ``game_service.get_progress_map`` mezclaba en una sola función la consulta
a la base, el recorrido en anchura (BFS) con su cola y su conjunto de visitados, y
la construcción de la respuesta. Aquí el recorrido queda encapsulado en un objeto
que expone solo el protocolo de iteración de Python (``__iter__`` / ``__next__``):
el cliente pide "el siguiente nodo" sin conocer la cola, los visitados ni cómo se
tratan los nodos inalcanzables.

Orden (idéntico al código original, fijado por ``test_progress_map_order_contract``):

1. Nodos alcanzables desde el nodo inicial, por niveles, siguiendo las decisiones
   en el orden en que llegan (id ascendente). Un ciclo no repite nodos.
2. Después, los nodos inalcanzables, por id ascendente.

El iterador no toca la base de datos: recibe los nodos y las aristas ya cargados,
así que se prueba con objetos simples.
"""
from collections import deque


class BreadthFirstNodeIterator:
    """Itera los nodos de un grafo de caso: alcanzables en anchura y luego el resto.

    ``nodes``: nodos (con ``id`` y ``start_node``) ya ordenados por id.
    ``edges``: pares ``(source_id, target_id)`` en el orden en que deben seguirse.
    El nodo inicial es el marcado ``start_node`` o, si no hay, el primero.
    """

    def __init__(self, nodes, edges):
        self._nodes = list(nodes)
        self._by_id = {n.id: n for n in self._nodes}
        self._adjacency = {}
        for source_id, target_id in edges:
            self._adjacency.setdefault(source_id, []).append(target_id)
        start = next((n for n in self._nodes if n.start_node), self._nodes[0] if self._nodes else None)
        self._frontier = deque([start.id] if start else [])
        self._visited = set()
        self._leftovers = None  # se materializa al terminar la fase de alcanzables

    def __iter__(self):
        return self

    def __next__(self):
        node = self._next_reachable()
        if node is not None:
            return node
        if self._leftovers is None:
            self._leftovers = iter([n for n in self._nodes if n.id not in self._visited])
        return next(self._leftovers)  # StopIteration al agotarse

    def _next_reachable(self):
        while self._frontier:
            current = self._frontier.popleft()
            if current in self._visited:
                continue
            self._visited.add(current)
            self._frontier.extend(
                nxt for nxt in self._adjacency.get(current, []) if nxt not in self._visited
            )
            if current in self._by_id:
                return self._by_id[current]
        return None

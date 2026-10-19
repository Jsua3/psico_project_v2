"""F9-10 · Toda mutación de autoría lleva la revisión del cliente hasta el servicio.

Con ``REVISION_REQUIRED`` encendida (el valor por defecto) una vista que NO reenvía la ``revision`` que el cliente mandó
responde 400 ``REVISION_REQUIRED`` siempre, sin que el cliente pueda hacer nada. La suite unitaria corre con la bandera
fijada en su valor heredado (``conftest.py``) y ninguna otra prueba recorre todas las rutas, así que esta guardia lo hace
por la forma: cada método que muta de una vista de ``authoring_views`` recoge la revisión (``self.payload`` la incluye,
``self.revision`` la devuelve sola), salvo los tres que no editan un borrador que ya existe.

Si añades una mutación que no necesita revisión, añádela a ``NO_REVISION`` con su motivo; si una de esas empieza a
recogerla, la lista dice que ya no hace falta.
"""
import inspect

import pytest

from apps.simulation.views import authoring_views as views

pytestmark = pytest.mark.req("RNF-08")

MUTATIONS = ("post", "put", "patch", "delete")
#: (vista, verbo) → por qué no lleva revisión: no editan un borrador existente.
NO_REVISION = {
    ("AdminCaseListCreateView", "post"): "crea un caso nuevo: aún no hay revisión que comparar",
    ("CaseImportView", "post"): "importa un documento y siempre crea un borrador nuevo",
    ("CloneVersionView", "post"): "clona una versión (publicada o archivada) en un borrador nuevo",
    ("CaseValidateView", "post"): "valida sin escribir (es POST por el contrato, no muta)",
    ("WorldValidateView", "post"): "valida el mundo sin escribir (es POST por el contrato, no muta)",
}


def _carries_revision(cls, verb) -> bool:
    source = inspect.getsource(vars(cls)[verb])
    return "self.payload(" in source or "self.revision(" in source


def _mutations():
    for name, cls in inspect.getmembers(views, inspect.isclass):
        if cls.__module__ != views.__name__ or not issubclass(cls, views._AuthoringView):
            continue
        for verb in MUTATIONS:
            if verb in vars(cls):
                yield pytest.param(cls, verb, id=f"{name}.{verb}")


def test_hay_mutaciones_que_comprobar():
    """Una guardia que no encuentra nada pasaría siempre: si la forma de las vistas cambia, esta avisa."""
    assert len(list(_mutations())) >= 25


@pytest.mark.parametrize(("cls", "verb"), list(_mutations()))
def test_toda_mutacion_de_autoria_recoge_la_revision_del_cliente(cls, verb):
    if (cls.__name__, verb) in NO_REVISION:
        return
    assert _carries_revision(cls, verb), (
        f"{cls.__name__}.{verb} muta un borrador y no recoge la revisión (``self.payload`` o ``self.revision``): con "
        "REVISION_REQUIRED encendida respondería 400 REVISION_REQUIRED siempre. Si de verdad no la necesita, "
        "añádela a NO_REVISION con su motivo."
    )


@pytest.mark.parametrize(("name", "verb"), sorted(NO_REVISION))
def test_las_exenciones_de_revision_siguen_siendo_necesarias(name, verb):
    cls = getattr(views, name)
    assert verb in vars(cls), f"{name}.{verb} ya no existe: quítala de NO_REVISION"
    assert not _carries_revision(cls, verb), f"{name}.{verb} ya recoge la revisión: quítala de NO_REVISION"

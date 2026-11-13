"""El contexto que se le da a la IA: lo que el lugar de la biblioteca ofrece y las competencias de la rúbrica.

``del_lugar`` es puro (recibe datos). Las claves de objeto salen de ``copiar_al_caso.claves_de_sala``: son las mismas que la
copia crea en la base, así que lo que la IA nombra existe en el caso. ``competencias_por_defecto`` es la única consulta.
"""
from apps.biblioteca.services import copiar_al_caso
from apps.simulation.assessment import competencies
from apps.simulation.casedef import vocabulary
from apps.simulation.models import Rubric
from apps.simulation.services.authoring.rules import ENDING_TONES


def competencias_por_defecto() -> list[dict]:
    """Las competencias de la rúbrica por defecto (activa), una vez cada una; ``[]`` si no hay rúbrica."""
    rubrica = Rubric.objects.filter(is_default=True, active=True).order_by("id").first()
    if rubrica is None:
        return []
    return [{"codigo": c.code, "nombre": c.name} for c in competencies.rubric_competencies(rubrica)]


def _sala(sala: dict, personajes: dict, objetos: dict) -> dict:
    claves = copiar_al_caso.claves_de_sala(sala)
    personas = []
    for colocado, clave in zip(sala.get("personajes", []), claves["personajes"]):
        info = personajes.get(colocado["ref"], {})
        personas.append({
            "clave": clave, "personaje": colocado["ref"], "nombre": info.get("nombre", ""), "rol": info.get("rol", ""),
        })
    revisables = []
    for colocado, clave in zip(sala.get("objetos", []), claves["objetos"]):
        modelo = objetos.get(colocado["ref"], {})
        revisables.append({"clave": clave, "nombre": modelo.get("nombre", ""), "alRevisar": modelo.get("alRevisar", "")})
    return {
        "id": sala["id"], "nombre": sala.get("nombre", ""), "descripcion": sala.get("descripcion", ""),
        "personas": personas, "objetos": revisables,
    }


def del_lugar(lugar: dict, competencias: list[dict]) -> dict:
    """El contexto del lugar: salas con sus personas y objetos revisables, hitos, competencias y vocabularios."""
    catalogo = lugar.get("catalogo", {})
    personajes = {p["id"]: p for p in lugar.get("personajes", [])}
    objetos = {o["id"]: o for o in catalogo.get("objetos", [])}
    return {
        "lugar": {"id": lugar["id"], "nombre": lugar.get("nombre", ""), "descripcion": lugar.get("descripcion", "")},
        "salas": [_sala(sala, personajes, objetos) for sala in lugar.get("salas", [])],
        "hitos": [
            {
                "clave": copiar_al_caso.clave_de_hito(hito["key"]), "nombre": hito.get("label", ""),
                "descripcion": hito.get("description", ""), "decisivo": bool(hito.get("decisive", False)),
            }
            for hito in lugar.get("hitos", [])
        ],
        "competencias": [{"codigo": c["codigo"], "nombre": c["nombre"]} for c in competencias],
        "listas": {
            "clases": [member.value for member in vocabulary.ResponseClass],
            "emociones": list(vocabulary.EXPRESSIONS),
            "gestos": list(vocabulary.GESTURES),
            "intensidades": [member.value for member in vocabulary.Intensity],
            "tonos": list(ENDING_TONES),
        },
    }

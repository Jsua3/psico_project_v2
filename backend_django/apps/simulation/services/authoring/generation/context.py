"""El contexto que se le da a la IA: lo que el lugar de la biblioteca ofrece y las competencias de la rúbrica.

``del_lugar`` es puro (recibe datos). Las claves de objeto salen de ``copiar_al_caso.claves_de_sala``: son las mismas que la
copia crea en la base, así que lo que la IA nombra existe en el caso. ``competencias_por_defecto`` es la única consulta.
"""
from apps.biblioteca.services import copiar_al_caso
from apps.simulation.assessment import competencies
from apps.simulation.casedef import catalogo as catalogo_piezas, vocabulary
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
    resultado = {
        "id": sala["id"], "nombre": sala.get("nombre", ""), "descripcion": sala.get("descripcion", ""),
        "personas": personas, "objetos": revisables,
    }
    if isinstance(sala.get("estructura"), dict):
        resultado["estructura"] = sala["estructura"]
        resultado["puertas"] = [
            {k: puerta[k] for k in ("id", "muro", "pos", "modelo") if k in puerta}
            for puerta in sala.get("puertas", [])
        ]
    return resultado


def _catalogo():
    catalogo = catalogo_piezas.vigente()
    if catalogo is None:
        return None
    return {
        "anchos": list(catalogo.anchos),
        "piezas": [
            {"tipo": p.tipo, "modelo": p.clave.split("/", 1)[1], "ocupa": p.ocupa,
             "muros": sorted(p.muros), "franja": list(p.franja)}
            for _, p in sorted(catalogo.piezas.items())
        ],
        "pisos": [{"piso": k.partition("-")[0], "variante": k.partition("-")[2]}
                  for k in sorted(catalogo.claves_de_pisos)],
        "muros": [{"muro": k.split("/", 1)[0], "paleta": k.split("/", 1)[1]}
                  for k in sorted(catalogo.muros)],
    }


def del_lugar(lugar: dict, competencias: list[dict]) -> dict:
    """El contexto del lugar: salas con sus personas y objetos revisables, hitos, competencias y vocabularios."""
    catalogo = lugar.get("catalogo", {})
    personajes = {p["id"]: p for p in lugar.get("personajes", [])}
    objetos = {o["id"]: o for o in catalogo.get("objetos", [])}
    resultado = {
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
    if any(isinstance(s.get("estructura"), dict) for s in lugar.get("salas", [])):
        resultado["catalogoPiezas"] = _catalogo()
    return resultado

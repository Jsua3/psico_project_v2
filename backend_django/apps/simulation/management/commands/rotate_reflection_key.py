"""Rota las bitácoras de reflexión a otra llave (S5-2), sin perder ninguna y sin parar el sistema.

    python manage.py rotate_reflection_key --dry-run       # descifra, cifra y comprueba: no escribe nada
    python manage.py rotate_reflection_key                 # a REFLECTION_ACTIVE_KEY
    python manage.py rotate_reflection_key --to <id>       # a otra llave de REFLECTION_KEYS (o la heredada)

Por cada fila pendiente: descifra con su llave; cifra con la de destino (con los datos asociados de SU intento y nodo);
descifra lo recién cifrado y, solo si coincide con el original, escribe la fila. Texto y referencia van en una sola
sentencia: una interrupción nunca deja una fila con una llave que no la descifra. Es reanudable: cada ejecución toma solo
lo que aún no está en el destino. «saltadas» cuenta las filas que otra sesión tenía bloqueadas o que ya estaban en el
destino al bloquearlas (una ejecución posterior las toma). Imprime recuentos e ids de filas fallidas, nunca texto, y sale
con error si alguna falló.
"""
from cryptography.exceptions import InvalidTag
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.simulation.models import ReflectionJournal
from apps.simulation.services import crypto_service

TAMANO_MAXIMO_LOTE = 2000


def _escribir(pk, texto_cifrado, llave):
    """Texto y referencia en una sola sentencia: la fila nunca queda con una llave que no la descifra."""
    ReflectionJournal.objects.filter(pk=pk).update(encrypted_text=texto_cifrado, encryption_key_ref=llave)


def _cifrado_para(fila, destino):
    """El texto de ``fila`` cifrado con ``destino``, o None si no pasa las comprobaciones: descifrar con su llave,
    cifrar con la de destino, volver a descifrar y obtener el mismo texto que el original."""
    datos = {"attempt_id": fila.attempt_id, "node_id": fila.node_id}
    try:
        original = crypto_service.decrypt(fila.encrypted_text, key_ref=fila.encryption_key_ref, **datos)
        nuevo = crypto_service.encrypt(original, key_ref=destino, **datos)
        recuperado = crypto_service.decrypt(nuevo, key_ref=destino, **datos)
    except (ValueError, InvalidTag):
        return None
    return nuevo if recuperado == original else None


class Command(BaseCommand):
    help = "Rota las bitácoras de reflexión a otra llave. Solo imprime recuentos e ids."  # BORRADOR

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Descifra, cifra y comprueba cada fila sin escribir nada.",  # BORRADOR
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=200,
            help="Filas por lote, de 1 a 2000 (por defecto 200).",  # BORRADOR
        )
        parser.add_argument(
            "--to",
            dest="to",
            default=None,
            help="Id de la llave de destino (por defecto, REFLECTION_ACTIVE_KEY).",  # BORRADOR
        )

    def handle(self, *args, **options):
        lote = options["batch_size"]
        if not 1 <= lote <= TAMANO_MAXIMO_LOTE:
            raise CommandError(
                # BORRADOR
                "--batch-size debe estar entre 1 y 2000."
            )
        destino = options["to"] or crypto_service.key_ref()
        llaves = getattr(settings, "REFLECTION_KEYS", None) or {}
        if destino != crypto_service.LEGACY_KEY_REF and destino not in llaves:
            raise CommandError(
                # BORRADOR
                "La llave de destino no es la heredada ni una de REFLECTION_KEYS (valor no mostrado)."
            )

        simulacro = options["dry_run"]
        leidas = rotadas = saltadas = 0
        fallidas = []
        ultimo_pk = 0
        while True:
            # Paginación por clave: una fila fallida sigue pendiente y no se vuelve a leer en esta misma ejecución.
            pendientes = list(
                ReflectionJournal.objects.filter(pk__gt=ultimo_pk)
                .exclude(encryption_key_ref=destino)
                .order_by("pk")
                .values_list("pk", flat=True)[:lote]
            )
            if not pendientes:
                break
            ultimo_pk = pendientes[-1]
            leidas += len(pendientes)
            if simulacro:
                for fila in ReflectionJournal.objects.filter(pk__in=pendientes).order_by("pk"):
                    if _cifrado_para(fila, destino) is None:
                        fallidas.append(fila.pk)
                    else:
                        rotadas += 1
                continue
            with transaction.atomic():
                # Bloqueo por fila: lo que otra sesión tiene bloqueado no se espera, se cuenta como saltado.
                filas = list(
                    ReflectionJournal.objects.select_for_update(skip_locked=True)
                    .filter(pk__in=pendientes)
                    .exclude(encryption_key_ref=destino)
                    .order_by("pk")
                )
                saltadas += len(pendientes) - len(filas)
                for fila in filas:
                    nuevo = _cifrado_para(fila, destino)
                    if nuevo is None:
                        fallidas.append(fila.pk)
                        continue
                    _escribir(fila.pk, nuevo, destino)
                    rotadas += 1

        modo = (
            # BORRADOR
            "simulación (no se escribió nada; «rotadas» cuenta lo que habría rotado)"
            if simulacro
            else "rotación"
        )
        self.stdout.write(
            # BORRADOR
            f"Bitácoras de reflexión, {modo}: leídas={leidas} rotadas={rotadas} saltadas={saltadas} fallidas={len(fallidas)}"
        )
        if fallidas:
            self.stdout.write(
                # BORRADOR
                "Filas que no se pudieron rotar (ids): " + ", ".join(str(pk) for pk in fallidas)
            )
            raise CommandError(
                # BORRADOR
                f"{len(fallidas)} filas no se pudieron rotar: su llave no está o su texto no se verifica."
            )

"""Grupo y sus dos tablas de unión.

``grupo_estudiante`` y ``grupo_case_version`` no tienen id propio: su clave
primaria es compuesta (``CompositePrimaryKey``). Son modelos explícitos y no un
``ManyToManyField`` para conservar los nombres de tabla y de columna y poder
guardar ``assigned_at``."""
from django.conf import settings
from django.db import models
from django.db.models.functions import Now


class Grupo(models.Model):
    nombre = models.CharField(max_length=255)
    codigo = models.CharField(max_length=50, unique=True)
    profesor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.DO_NOTHING,
        db_column="profesor_id",
        related_name="grupos_impartidos",
    )
    activo = models.BooleanField(default=True, db_default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "grupos"

    def __str__(self):
        return f"{self.nombre} ({self.codigo})"


class GrupoEstudiante(models.Model):
    pk = models.CompositePrimaryKey("grupo_id", "estudiante_id")
    grupo = models.ForeignKey(Grupo, on_delete=models.DB_CASCADE, db_column="grupo_id")
    estudiante = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.DB_CASCADE, db_column="estudiante_id"
    )

    class Meta:
        db_table = "grupo_estudiante"


class GrupoCaseVersion(models.Model):
    pk = models.CompositePrimaryKey("grupo_id", "case_version_id")
    grupo = models.ForeignKey(Grupo, on_delete=models.DB_CASCADE, db_column="grupo_id")
    case_version = models.ForeignKey(
        "simulation.CaseVersion", on_delete=models.DB_CASCADE, db_column="case_version_id"
    )
    assigned_at = models.DateTimeField(null=True, db_default=Now())

    class Meta:
        db_table = "grupo_case_version"

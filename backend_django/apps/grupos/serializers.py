from rest_framework import serializers


class CrearGrupoSerializer(serializers.Serializer):
    nombre = serializers.CharField()
    codigo = serializers.CharField()


class ActualizarGrupoSerializer(serializers.Serializer):
    nombre = serializers.CharField(required=False)
    codigo = serializers.CharField(required=False)

    def validate(self, attrs):
        if "nombre" not in attrs and "codigo" not in attrs:
            raise serializers.ValidationError("Envía nombre o código para actualizar")
        return attrs


class AgregarEstudianteSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ImportarEstudiantesSerializer(serializers.Serializer):
    file = serializers.FileField()

    def validate_file(self, value):
        name = (value.name or "").lower()
        if not name.endswith(".xlsx"):
            raise serializers.ValidationError("Carga un archivo .xlsx")
        return value


class AsignarCasoSerializer(serializers.Serializer):
    caseVersionId = serializers.IntegerField()


class AssignmentTargetSerializer(serializers.Serializer):
    """El destino de una asignación (C7): un grupo hoy, un estudiante después (decisión 5)."""

    type = serializers.ChoiceField(choices=["GROUP", "STUDENT"])
    groupId = serializers.IntegerField(required=False)
    studentId = serializers.IntegerField(required=False)

    def validate(self, attrs):
        needed = "groupId" if attrs["type"] == "GROUP" else "studentId"
        if needed not in attrs:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise serializers.ValidationError({needed: "Este campo es obligatorio para ese destino."})
        return attrs


class AssignmentCreateSerializer(serializers.Serializer):
    """``POST /api/assignments``: las fechas llegan como texto ISO 8601 y las valida el servicio."""

    caseVersionId = serializers.IntegerField()
    target = AssignmentTargetSerializer()
    opensAt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    closesAt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sortOrder = serializers.IntegerField(required=False)


class AssignmentUpdateSerializer(serializers.Serializer):
    """``PATCH /api/assignments/{id}``: solo lo que viene se toca; ``null`` borra una fecha."""

    opensAt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    closesAt = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    sortOrder = serializers.IntegerField(required=False)
    active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            # BORRADOR: texto nuevo del servidor, pendiente de la aprobación de Psicología (VD-23).
            raise serializers.ValidationError("Envía al menos un campo para actualizar la asignación.")
        return attrs

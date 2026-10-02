from rest_framework import serializers


class StartAttemptRequest(serializers.Serializer):
    caseVersionId = serializers.IntegerField()
    forceNew = serializers.BooleanField(required=False, default=False)


class SelectDecisionRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    decisionOptionId = serializers.IntegerField()
    evidenceOverride = serializers.BooleanField(required=False, default=False)
    missingEvidence = serializers.ListField(
        child=serializers.CharField(max_length=160),
        required=False,
        default=list,
        max_length=8,
    )


class ReflectionRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    nodeId = serializers.IntegerField()
    text = serializers.CharField(allow_blank=True, trim_whitespace=False)


class SafeExitRequest(serializers.Serializer):
    attemptToken = serializers.CharField()
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class ResumeAttemptRequest(serializers.Serializer):
    attemptToken = serializers.CharField()

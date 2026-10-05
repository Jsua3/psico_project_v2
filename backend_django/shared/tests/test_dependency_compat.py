"""Vectores fijos de compatibilidad para las dependencias criptográficas.

Si una actualización de ``cryptography`` o ``bcrypt`` cambiara el formato o el
comportamiento, los datos YA guardados (reflexiones cifradas, hashes de
contraseña) quedarían ilegibles y ninguna otra prueba lo notaría: todas
cifran y descifran con la misma versión. Estos vectores se generaron con
cryptography 43.0.3 / bcrypt 4.2.0 y NO deben regenerarse al actualizar:
si fallan, la actualización rompe datos existentes.
"""
import bcrypt
import pytest

from apps.simulation.services import crypto_service
from apps.users.models import CustomUser

SECRET = "vector-fijo-compat-secret"
PLAIN = "Reflexión de prueba: ñandú, ¿cómo estás? 😀"
# base64( IV(12) || ciphertext || tag(16) ), clave = SHA-256(SECRET)[:32].
GCM_VECTOR = (
    "AAECAwQFBgcICQoLrvm0tZXtFNp4AtGSIKbVtKjufnr5+8rtteUA9igpJ73jaxO+"
    "1/rHBzRxNS19drUNiJ39fRZA6CUIUYrXec6qkrmpZg=="
)
# Hash de `admin@psychosim.edu.co` copiado de deploy/db_seed.sql ($2b$, 10 rondas).
SEED_ADMIN_HASH = "$2b$10$nLO9mYIN3iuPaqDg4Ef5quG0zE2jAHr.m.SsVGlVLa/YlEka0FbGK"
SEED_ADMIN_PASSWORD = "Admin123!"
BCRYPT_VECTOR = "$2b$04$Ifw5J5/KSorEeVNEjn2bj.84yCd5J0Ybp2SI9QV2CTTNT81uvb7fC"


def test_reflection_vector_still_decrypts(settings):
    settings.REFLECTION_ENCRYPTION_KEY = SECRET

    assert crypto_service.decrypt(GCM_VECTOR) == PLAIN


def test_reflection_encrypt_decrypt_roundtrip(settings):
    settings.REFLECTION_ENCRYPTION_KEY = SECRET

    assert crypto_service.decrypt(crypto_service.encrypt(PLAIN)) == PLAIN


def test_reflection_tampered_ciphertext_is_rejected(settings):
    settings.REFLECTION_ENCRYPTION_KEY = SECRET
    tampered = GCM_VECTOR[:-6] + ("A" if GCM_VECTOR[-6] != "A" else "B") + GCM_VECTOR[-5:]

    with pytest.raises(Exception):
        crypto_service.decrypt(tampered)


def test_seed_admin_hash_still_verifies():
    user = CustomUser(email="admin@psychosim.edu.co", password=SEED_ADMIN_HASH)

    assert user.check_password(SEED_ADMIN_PASSWORD)
    assert not user.check_password("otra-clave")


def test_bcrypt_vector_still_verifies():
    assert bcrypt.checkpw(b"Estudiante123!", BCRYPT_VECTOR.encode())


def test_new_hashes_stay_bcrypt_2b():
    user = CustomUser(email="nuevo@psychosim.edu.co")

    user.set_password("Clave-Nueva-123!")

    assert user.password.startswith("$2b$10$")
    assert user.check_password("Clave-Nueva-123!")

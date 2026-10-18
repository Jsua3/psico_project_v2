# SIEP — imagen única para Railway: build de Angular + backend Django (gunicorn).
# El backend Django sirve la API en /api y el SPA de Angular en el resto de rutas
# (WhiteNoise para los estáticos), así todo vive en un solo dominio sin CORS.

# ---------- Stage 1: build del frontend (Angular) ----------
FROM node:26-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: backend (Django + gunicorn) ----------
FROM python:3.14-slim AS backend
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DJANGO_SETTINGS_MODULE=psychosim.settings.production
WORKDIR /app

COPY backend_django/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend_django/ ./
# El build de Angular (carpeta browser/) se copia a frontend_dist para WhiteNoise.
COPY --from=frontend /fe/dist/psychosim-admin-panel/browser ./frontend_dist

EXPOSE 8000
# Railway inyecta $PORT. El esquema lo construye `migrate` (Django es el dueño; E0-8) y se
# aplica ANTES de servir; con más de una réplica habría que moverlo a un paso de despliegue.
# Gunicorn sirve la app WSGI de Django con hilos (E5-3): 3 procesos × 4 hilos. Memoria medida con esta imagen en Linux
# (2026-10-17, en reposo tras ~480 peticiones): el maestro ≈ 32 MB y cada worker ≈ 96 MB de RSS (≈ 320 MB sumados, con
# las páginas compartidas contadas dos veces). Bajo la carga del aula la mide el nocturno (E5-4); los 164 MB de RSS pico
# de E0-2 son de UN proceso de `runserver` con 40 estudiantes, no de esta configuración.
CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn psychosim.wsgi:application --bind 0.0.0.0:${PORT:-8000} --worker-class gthread --workers 3 --threads 4 --timeout 120 --access-logfile - --error-logfile -"]


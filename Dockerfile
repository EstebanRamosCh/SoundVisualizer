FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Instalar dependencias del sistema para procesamiento de audio (libsndfile y ffmpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Instalar dependencias de Python aprovechando el caché de capas
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copiar el resto del código de la aplicación
COPY . .

# Exponer puertos comunes para PaaS (8080 estándar de Railway, 5001 local)
EXPOSE 8080
EXPOSE 5001

# Iniciar servidor Uvicorn enlazado a 0.0.0.0 y al puerto provisto por Railway ($PORT o 8080)
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080}"]

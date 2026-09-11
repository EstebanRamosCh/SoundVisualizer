"""
Script de inicio para BassScope Pro
Inicia el servidor Uvicorn de forma compatible tanto localmente como en despliegues cloud (Railway).
"""

import os
import sys
import time
import webbrowser
import threading
import uvicorn

# Puerto y Host adaptables (toma variables de entorno en producción como Railway)
IS_PRODUCTION = bool(os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("PORT"))
PORT = int(os.environ.get("PORT", 5001))
HOST = os.environ.get("HOST", "0.0.0.0" if IS_PRODUCTION else "127.0.0.1")

def open_browser():
    time.sleep(1.2)
    url = f"http://127.0.0.1:{PORT}"
    print(f"\n[INFO] Abriendo aplicacion en el navegador: {url}\n")
    try:
        webbrowser.open(url)
    except Exception:
        pass

if __name__ == "__main__":
    print("=" * 65)
    print("   BassScope Pro - Analizador de Senales y Pedales para Bajo")
    print("=" * 65)
    print(f" Servidor iniciado en: http://{HOST}:{PORT}")
    if not IS_PRODUCTION:
        print(" Conecta tu bajo a la interfaz de audio o entrada de microfono.")
        print(" Presiona Ctrl+C en esta terminal para detener el servidor.")
        threading.Thread(target=open_browser, daemon=True).start()
    else:
        print(" Ejecutando en entorno cloud (Railway / Contenedor)")
    print("=" * 65)

    # Ejecutar servidor Uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, log_level="info")

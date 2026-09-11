"""
Script de pruebas automatizadas para BassScope Pro
"""

import io
import base64
import numpy as np
import soundfile as sf
from starlette.testclient import TestClient
from main import app

def test_full_application():
    print("Iniciando pruebas de la aplicacion BassScope Pro...")
    client = TestClient(app)

    # 1. Probar ruta raiz GET /
    response = client.get("/")
    assert response.status_code == 200, f"Fallo al cargar /: {response.status_code}"
    assert "BassScope Pro" in response.text
    assert "canvasSpectrum" in response.text
    assert "canvasOsc" in response.text
    assert "canvasWaterfall" in response.text
    assert "canvasPedals" in response.text
    print("[OK] Ruta principal (/) respondio 200 OK con los elementos de FastHTML (incluye Cascada y Rack Pedales).")

    # 1b. Probar ruta de health check
    res_health = client.get("/health")
    assert res_health.status_code == 200, f"Fallo en /health: {res_health.status_code}"
    assert res_health.text == "OK"
    print("[OK] Ruta de comprobacion de salud (/health) respondio 200 OK.")

    # 2. Probar archivos estaticos
    res_css = client.get("/static/css/visualizer.css")
    assert res_css.status_code == 200, "Fallo al servir visualizer.css"
    assert "--accent-green" in res_css.text
    print("[OK] Archivo CSS servido correctamente (200 OK).")

    res_js = client.get("/static/js/visualizer.js")
    assert res_js.status_code == 200, "Fallo al servir visualizer.js"
    assert "drawSpectrum" in res_js.text
    print("[OK] Archivo JavaScript del motor Web Audio API servido correctamente (200 OK).")

    # 3. Probar endpoint de analisis profundo /api/analyze con una senal de bajo sintetizada
    sr = 44100
    t = np.linspace(0, 1.5, int(sr * 1.5), endpoint=False)
    # Nota E1 (41.2 Hz) fundamental del bajo, con 2do armonico (82.4 Hz) y 3er armonico (123.6 Hz)
    y = 0.7 * np.sin(2 * np.pi * 41.2 * t) + 0.35 * np.sin(2 * np.pi * 82.4 * t) + 0.2 * np.sin(2 * np.pi * 123.6 * t)
    # Saturacion suave tipo Overdrive
    y = np.clip(y * 1.4, -0.9, 0.9)

    buf = io.BytesIO()
    sf.write(buf, y, sr, format="WAV")
    buf.seek(0)
    audio_b64 = base64.b64encode(buf.read()).decode("utf-8")

    res_api = client.post("/api/analyze", json={"audio_b64": audio_b64})
    assert res_api.status_code == 200, f"Error en /api/analyze: {res_api.status_code} - {res_api.text}"
    data = res_api.json()
    
    assert "image_base64" in data
    assert data["image_base64"].startswith("data:image/png;base64,")
    assert "fundamental_note" in data
    assert "crest_factor" in data
    assert "insights" in data
    assert len(data["insights"]) > 0

    print("[OK] Endpoint /api/analyze proceso la senal exitosamente:")
    print(f"   - Nota fundamental: {data['fundamental_note']} ({data['fundamental_hz']})")
    print(f"   - THD estimada: {data['thd_percent']}")
    print(f"   - Factor de cresta: {data['crest_factor']}")
    print(f"   - Armonicos detectados: {len(data['harmonics'])}")
    print(f"   - Diagnostico: {data['insights'][0]}")

    print("\nTODAS LAS PRUEBAS PASARON SATISFACTORIAMENTE.")

if __name__ == "__main__":
    test_full_application()

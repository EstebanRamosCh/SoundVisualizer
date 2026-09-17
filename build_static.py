"""
Script de compilación estática para BassScope Pro (Netlify y CDNs)
Renderiza los componentes FastHTML a un archivo index.html independiente.
"""

import re
from pathlib import Path
from starlette.testclient import TestClient
from main import app

def build():
    print("Iniciando compilación de sitio estático para Netlify...")
    client = TestClient(app)
    response = client.get("/")
    if response.status_code != 200:
        raise RuntimeError(f"Error al renderizar página principal: {response.status_code}")
    
    html = response.text
    
    # 1. Limpiar encabezados generados por TestClient de Starlette
    html = re.sub(r'<link rel="canonical" href="https://testserver/?">\s*', '', html)
    html = re.sub(r'<title>FastHTML page</title>\s*', '', html)
    
    # 2. Asegurar que las etiquetas meta esenciales y el título estén en orden
    target_path = Path(__file__).parent / "index.html"
    target_path.write_text(html, encoding="utf-8")
    
    file_size_kb = target_path.stat().st_size / 1024
    print(f"[OK] index.html generado con éxito ({file_size_kb:.1f} KB) en {target_path}")

if __name__ == "__main__":
    build()

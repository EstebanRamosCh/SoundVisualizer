# AGENTS.md | Guía para Agentes y Desarrolladores

Bienvenido a **BassScope Pro**. Este documento proporciona las directrices de arquitectura, mapa del repositorio, convenciones de desarrollo y procedimientos de despliegue en la nube (Railway) para agentes de IA y desarrolladores.

---

## 📌 1. Visión General del Proyecto

**BassScope Pro** es una aplicación web en Python construida con **FastHTML**, diseñada para emular analizadores de espectro profesionales de estudio (como *Voxengo SPAN* o *FabFilter Pro-Q/C*) para la interpretación de transformaciones sonoras en **bajos eléctricos a través de pedales análogos** (Overdrive, Compresor, EQ, Preamp, Modulación), sin necesidad de un DAW.

### Principios Arquitectónicos Clave:
* **Renderizado en Tiempo Real (Latencia Cero)**: El cálculo rápido de FFT y oscilograma se realiza en el cliente mediante la **Web Audio API** del navegador a 60 FPS con aceleración por hardware en lienzos `<canvas>`.
* **Procesamiento Espectral Profundo (Backend)**: El análisis instantáneo exhaustivo (espectrograma STFT logarítmico, descomposición armónica, cálculo de distorsión armónica THD% y diagnóstico de dinámica) se realiza en el servidor Python utilizando **Librosa**, **SciPy** y **Matplotlib**.
* **Requisito de Contexto Seguro (HTTPS)**: La API `navigator.mediaDevices.getUserMedia` del navegador exige HTTPS en producción para otorgar acceso a la interfaz de audio o micrófono. Railway provee este certificado SSL automáticamente.

---

## 📂 2. Mapa de Archivos del Repositorio

```text
├── main.py                  # Servidor FastHTML: rutas '/', '/api/analyze' y componentes UI
├── analyzer.py              # Motor DSP en Python con Librosa, SciPy y Matplotlib
├── run.py                   # Script de inicio adaptable (local con navegador / cloud en 0.0.0.0)
├── test_app.py              # Suite de pruebas automatizadas con señales sintéticas
├── requirements.txt         # Dependencias de Python (optimizadas para despliegues cloud)
├── Procfile                 # Comando de proceso web para Railway / PaaS
├── railway.toml             # Configuración de despliegue e infraestructura en Railway
├── nixpacks.toml            # Paquetes a nivel de sistema operativo Nix (libsndfile, ffmpeg)
├── .python-version          # Versión fija de Python (3.12.3)
├── .gitignore               # Exclusiones de Git
├── README.md                # Guía de usuario y manual de interpretación de pedales
├── agents.md                # Este documento de arquitectura y directrices para agentes
└── static/
    ├── css/visualizer.css   # Estilo tema oscuro pro-audio, responsive móvil/escritorio
    └── js/visualizer.js     # Motor Web Audio API (4 Canvas, FFT, Touch y Delta EQ)
```

---

## 🛠️ 3. Reglas y Convenciones de Desarrollo para Agentes

Al realizar modificaciones en el código, los agentes deben cumplir estrictamente con las siguientes directrices:

1. **No Romper Vistas Existentes**:
   - Las 5 vistas del visualizador (`Espectro FFT`, `Osciloscopio`, `Doble Vista`, `Cascada STFT`, `Laboratorio de Pedales`) deben permanecer accesibles y funcionales.
   - Cualquier nueva visualización debe ser aditiva.

2. **Preservación del Audio Análogo Crudo**:
   - En `static/js/visualizer.js`, **NUNCA** activar `echoCancellation`, `noiseSuppression` o `autoGainControl`. Deben permanecer en `false` para no recortar frecuencias graves del bajo ni falsear la respuesta dinámica de los pedales.

3. **Responsividad Móvil Obligatoria**:
   - Todo elemento nuevo debe adaptarse a pantallas táctiles de celulares (ancho $\le 640\text{px}$).
   - Los botones e interactivos deben tener un área táctil mínima de 40-44px.
   - Los lienzos Canvas deben redibujarse nítidamente utilizando `ResizeObserver`.
   - El tooltip de inspección debe soportar eventos `touchstart` y `touchmove`, posicionándose por encima del dedo para no obstruir la lectura.

4. **Compatibilidad con Servidores Cloud Headless**:
   - `analyzer.py` usa `matplotlib.use('Agg')` para renderizar gráficos a buffers en memoria base64 sin requerir un servidor X11/pantalla.
   - No añadir librerías que requieran drivers de audio locales de hardware como `sounddevice` o `pyaudio` en el backend, ya que la captura se realiza en el navegador del usuario y se envía mediante audio PCM/WAV.

5. **Verificación Continua**:
   - Tras cualquier cambio en `main.py`, `analyzer.py` o archivos estáticos, se debe ejecutar:
     ```bash
     python test_app.py
     ```
   - El script debe arrojar código de salida 0 con todas las pruebas aprobadas.

---

## ☁️ 4. Procedimiento de Despliegue en Railway desde GitHub

Para desplegar esta aplicación en [Railway](https://railway.app) a partir de este repositorio de GitHub:

### Paso 1: Subir el proyecto a GitHub
```bash
git init
git add .
git commit -m "feat: BassScope Pro FastHTML visualizer with Railway deploy config"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

### Paso 2: Crear el Proyecto en Railway
1. Ingresa a tu cuenta de [Railway](https://railway.app/).
2. Haz clic en **"New Project"** $\rightarrow$ **"Deploy from GitHub repo"**.
3. Selecciona tu repositorio de GitHub.

### Paso 3: Configuración Automática
Railway detectará automáticamente la configuración gracias a los archivos incluidos:
* **`railway.toml` & `nixpacks.toml`**: Instalan `libsndfile` y configuran el comando de inicio.
* **`Procfile`**: Define el worker web `uvicorn main:app --host 0.0.0.0 --port ${PORT:-5001}`.
* **`requirements.txt`**: Instala las dependencias de Python.

### Paso 4: Habilitar Dominio Público (HTTPS)
1. En el panel del servicio en Railway, ve a la pestaña **"Settings"**.
2. En la sección **"Networking"**, haz clic en **"Generate Domain"**.
3. Railway asignará una URL con certificado SSL gratuito (por ejemplo: `https://bassscope-production.up.railway.app`).
4. Abre la URL generada: el navegador solicitará permiso de micrófono/interfaz de audio en un contexto seguro HTTPS y la aplicación estará lista para funcionar en cualquier computador o celular en el mundo.

---

## 🧪 5. Comandos de Prueba y Mantenimiento

* **Ejecución Local**:
  ```bash
  python run.py
  ```
* **Ejecución de Pruebas Automatizadas**:
  ```bash
  python test_app.py
  ```
* **Verificación de Sintaxis**:
  ```bash
  python -m py_compile main.py analyzer.py run.py
  ```

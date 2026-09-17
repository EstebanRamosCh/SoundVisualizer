# BassScope Pro 🎸 | Visualizador de Señales y Frecuencias para Bajo Eléctrico

Una aplicación web desarrollada en Python con **FastHTML**, aceleración de gráficos en **Canvas** vía **Web Audio API** y motor de análisis espectral profundo con **Librosa** y **SciPy**.

Diseñada específicamente para emular la experiencia de un analizador de espectro profesional de estudio (como **Voxengo SPAN** o **FabFilter Pro-Q** en un DAW) pero ejecutándose de forma ligera y directa en tu navegador, tomando la señal de tu bajo a través del micrófono del PC o de una interfaz de audio USB.

---

## 🚀 Cómo Iniciar la Aplicación

1. Asegúrate de tener las dependencias instaladas (en este entorno ya están listas):
   ```bash
   pip install -r requirements.txt
   ```

2. Ejecuta el servidor local:
   ```bash
   python run.py
   ```
   La aplicación se iniciará en `http://127.0.0.1:5001` y se abrirá automáticamente en tu navegador predeterminado.

---

## 🎛️ Conexión de tu Bajo Eléctrico

1. **Opción A (Interfaz de Audio USB - Recomendado)**:
   - Conecta tu bajo a la entrada de instrumento (Hi-Z) de tu interfaz (Scarlett, Behringer, etc.).
   - Conecta la salida de tu cadena de pedales análogos a la interfaz.
   - En el menú superior de BassScope Pro, selecciona tu interfaz en el menú desplegable.

2. **Opción B (Entrada de Micrófono / Línea de la PC)**:
   - Conecta el cable de salida de tu pedal o preamplificador a la entrada de audio (Mic/Line In) del computador.
   - Selecciona "Micrófono" en el menú desplegable.

3. Haz clic en **`🎤 Conectar Bajo`** y acepta el permiso del navegador.

> **Nota técnica importante**: La aplicación solicita la señal con `echoCancellation: false`, `noiseSuppression: false` y `autoGainControl: false`. Esto asegura que el sistema operativo **no** aplique filtros de llamada telefónica que recortan las frecuencias graves o falsean la dinámica del bajo.

---

## 🔍 Cómo Interpretar tus Pedales Análogos

### 1. Pedales de Ecualización y Preamplificadores (EQ / Preamps)
* **Objetivo**: Ver exactamente qué frecuencias corta o realza cada potenciómetro (graves, medios, agudos).
* **Cómo usarlo**:
  1. Toca una nota con el pedal apagado (Bypass).
  2. Haz clic en el botón **`💾 Guardar Referencia A (Bypass)`**. Verás una curva punteada cian que congela la respuesta de tu bajo limpio.
  3. Enciende tu pedal de EQ, mueve las perillas y toca la misma nota.
  4. La curva activa (verde neón) se superpondrá a la curva de referencia, revelando instantáneamente la curva de ganancia (boost de graves en 80 Hz, corte de medios en 500 Hz, etc.).
  5. Activa la opción **`Zoom Bajos (20 Hz - 2.5 kHz)`** para tener máxima precisión visual en el rango de tu instrumento.

### 2. Pedales de Overdrive, Distorsión y Fuzz
* **Objetivo**: Medir la riqueza armónica y la saturación.
* **Cómo usarlo**:
  - En la vista **Espectro FFT**, toca una nota limpia (por ejemplo la cuerda La `A1` en 55 Hz). Verás una espiga alta en 55 Hz y muy pocas espigas secundarias.
  - Enciende tu Overdrive/Fuzz: verás emerger inmediatamente una serie de espigas armónicas en los múltiplos exactos:
    - 2º armónico: 110 Hz (Octava)
    - 3º armónico: 165 Hz (Quinta)
    - 4º armónico: 220 Hz (Segunda octava)
    - 5º armónico: 275 Hz (Tercera mayor)
  - En la pestaña **Osciloscopio**, observa cómo la onda senoidal se aplana o se vuelve cuadrada (*clipping* analógico).

### 3. Pedales de Compresión
* **Objetivo**: Controlar la dinámica y nivelar el ataque de la uña o slap.
* **Cómo usarlo**:
  - Fíjate en el indicador **`Factor de Cresta (dB)`** en la barra de telemetría inferior:
    - **Señal Limpia sin Compresión**: Típicamente entre **14 dB y 18 dB** (el golpe del ataque es mucho mayor que el sostenido).
    - **Señal Comprimida**: El factor de cresta se reduce a **6 dB - 9 dB**.
  - En el **Osciloscopio**, toca un slap fuerte: con el compresor apagado la onda tocará las líneas rojas punteadas de saturación. Con el compresor activo, la cresta del pico se mantendrá controlada dentro del rango seguro.

---

## 🔬 Nuevas Vistas Especializadas

Sin alterar ninguna de las vistas existentes, se han añadido dos modos complementarios en la barra de pestañas:

### 🌊 Pestaña: Cascada STFT (3D/2D Waterfall Spectrogram)
- Desplaza el espectro continuamente hacia abajo en el tiempo con un mapa térmico de frecuencias.
- **Utilidad clave**:
  - Permite ver el sostenido temporal (*sustain*) de cada armónico generado por el compresor.
  - Permite visualizar los barridos de filtro y modulación de pedales como Chorus, Phaser, Flanger o Envelope Filters (Auto-Wah).

### 🎛️ Pestaña: Laboratorio de Pedales
- Reúne en un solo panel de control 3 gráficos especializados:
  1. **Barras de Armónicos Discretos (1x a 6x)**: identifica la fundamental y mide en tiempo real los armónicos sucesivos.
  2. **Termómetro de Simetría (Pares vs. Impares)**: indica si la saturación es asimétrica (predominio de armónicos pares: calidez valvular/FET) o simétrica (predominio de armónicos impares: distorsión agresiva de silicio/fuzz).
  3. **Historial de Envolvente Dinámica**: muestra la curva temporal continua de pico y RMS de los últimos segundos para ver cómo el compresor aplasta los ataques y eleva la cola.
  4. **Curva Diferencial $\Delta\text{EQ}$**: al activar "Guardar Ref. A (Bypass)", dibuja la curva de ganancia diferencial ($\Delta\text{dB}$) mostrando exactamente los cortes y realces de tu ecualizador.

---

## 🔬 Análisis Profundo con Librosa

Cuando encuentres un tono que desees estudiar a fondo:
1. Toca y sostén una nota o frase en tu bajo.
2. Haz clic en el botón **`🔬 Analizar Instantánea con Librosa`**.
3. La aplicación grabará una ráfaga de 2 segundos sin pérdida, la enviará al backend de Python y calculará:
   - **Forma de Onda**: Envolvente y nivel relativo.
   - **Espectrograma STFT**: Cascada de tiempo vs frecuencia en escala logarítmica generada por `librosa.display.specshow`.
   - **Espectro FFT con Armónicos**: Identificación automática de la frecuencia fundamental ($f_0$) y la nota musical.
   - **Métrica THD (%)**: Distorsión Armónica Total estimada.
   - **Diagnóstico Analógico**: Evaluación técnica automática del comportamiento del pedal.

---

## ☁️ Despliegue en Netlify

**BassScope Pro** está optimizado para desplegarse de manera inmediata en la red CDN global de **Netlify** con certificado SSL/HTTPS automático (indispensable para que los navegadores otorguen permiso de acceso a la interfaz de audio o micrófono).

### Paso 1: Subir el proyecto a GitHub
Asegúrate de que tus últimos cambios estén en tu repositorio de GitHub:
```bash
git add .
git commit -m "feat: soporte completo para despliegue en Netlify"
git push origin main
```

### Paso 2: Crear el Sitio en Netlify
1. Ingresa a tu cuenta en [Netlify](https://app.netlify.com/).
2. Haz clic en **"Add new site"** $\rightarrow$ **"Import an existing project"**.
3. Selecciona tu proveedor (**GitHub**) y escoge el repositorio de **BassScope Pro**.

### Paso 3: Configuración de Construcción
Netlify detectará automáticamente el archivo `netlify.toml` incluido en el proyecto:
* **Base directory**: *(dejar en blanco / raíz)*
* **Build command**: *(dejar en blanco o `python build_static.py` si deseas regenerar)*
* **Publish directory**: `.`

Haz clic en **"Deploy BassScope Pro"**. En menos de 10 segundos tu visualizador estará en línea en todo el mundo.

### 🎛️ Modos de Operación en Netlify:
* **Modo 1 (Autónomo en Netlify - Recomendado)**:
  - **Latencia Cero y Costo Cero**: Las 5 vistas en tiempo real (`Espectro FFT`, `Osciloscopio`, `Doble Vista`, `Cascada STFT`, `Laboratorio de Pedales`), el afinador cromático, la retención de picos y la curva $\Delta\text{EQ}$ se ejecutan 100% en el navegador del usuario a 60 FPS mediante la **Web Audio API**.
  - Al pulsar *Analizar Instantánea*, la aplicación genera un diagnóstico dinámico y oscilograma directamente en el cliente.
* **Modo 2 (Híbrido con Backend Librosa en Railway/Render)**:
  - Si deseas calcular espectrogramas STFT profundos en Python con Librosa, despliega el contenedor en Railway (usando el `Dockerfile` incluido).
  - En `netlify.toml`, descomenta las líneas de proxy hacia tu backend:
    ```toml
    [[redirects]]
      from = "/api/*"
      to = "https://tu-backend.up.railway.app/api/:splat"
      status = 200
      force = true
    ```
  - Netlify redirigirá las llamadas de `/api/analyze` a tu servidor de Railway sin problemas de CORS.

---

## 📁 Estructura del Código

```text
├── index.html               # Entrypoint estático optimizado para Netlify CDN
├── netlify.toml             # Configuración de despliegue, permisos de micrófono y caché en Netlify
├── _redirects               # Reglas de redirección de respaldo para Netlify
├── build_static.py          # Generador de index.html a partir de componentes FastHTML
├── main.py                  # Aplicación FastHTML (Rutas, UI y endpoint /api/analyze)
├── analyzer.py              # Motor de análisis DSP en Python (Librosa, SciPy, Matplotlib)
├── run.py                   # Script de ejecución local adaptable
├── test_app.py              # Suite de pruebas automatizadas con señales sintéticas
├── requirements.txt         # Dependencias del entorno Python
├── Dockerfile               # Contenedor para despliegues cloud (Railway / PaaS)
├── Procfile                 # Comando web para Railway / PaaS
├── railway.toml             # Configuración de infraestructura en Railway
├── nixpacks.toml            # Paquetes a nivel de sistema operativo Nix (libsndfile, ffmpeg)
└── static/
    ├── css/visualizer.css   # Estilo oscuro profesional de audio de alta precisión
    └── js/visualizer.js     # Motor Web Audio API (FFT, osciloscopio y render Canvas 60 FPS)
```


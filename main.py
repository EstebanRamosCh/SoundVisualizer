"""
Visualizador de Señales de Audio y Frecuencias para Bajo Eléctrico y Pedales Análogos
Desarrollado en Python con FastHTML, Web Audio API y Librosa
"""

import base64
from fasthtml.common import (
    fast_app, serve, Link, Script, Title, Meta,
    Div, Header, Main, Section, H1, H2, H3, H4, P, Span,
    Button, Select, Option, Input, Label, Canvas,
    Request
)
from starlette.responses import JSONResponse
from analyzer import analyze_audio_buffer

# Encabezados estáticos y fuentes
app_hdrs = (
    Title("BassScope Pro | Analizador de Frecuencias y Pedales para Bajo"),
    Meta(name="viewport", content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"),
    Link(rel="stylesheet", href="/static/css/visualizer.css"),
    Script(src="/static/js/visualizer.js", defer=True)
)

# Inicializar aplicación FastHTML sin CSS genérico externo
app, rt = fast_app(hdrs=app_hdrs, pico=False)


@rt("/")
def get():
    return Div(
        # --- Cabecera Superior ---
        Header(
            Div(
                Div("🎸", cls="brand-icon"),
                Div(
                    H1("BassScope Pro", cls="brand-title"),
                    Span("Analizador de Frecuencias & Pedales Análogos (Estilo SPAN)", cls="brand-subtitle")
                ),
                cls="brand"
            ),
            Div(
                Select(
                    Option("Buscando dispositivos de audio...", value=""),
                    id="audioSource",
                    cls="custom-select"
                ),
                Button("🎤 Conectar Bajo", id="btnStart", cls="btn btn-primary"),
                Button("⏸ Congelar", id="btnFreeze", cls="btn btn-secondary", disabled=True),
                Div(
                    Span(cls="status-led", id="statusLed"),
                    Span("DESCONECTADO", id="statusText"),
                    cls="status-pill"
                ),
                cls="header-controls"
            ),
            cls="top-header"
        ),

        # --- Contenedor Principal ---
        Main(
            # Área de Visualización (Pantalla Rack)
            Section(
                Div(
                    # Barra de herramientas del visor
                    Div(
                        Div(
                            Button("Espectro FFT (SPAN)", id="tabSpectrum", cls="view-tab active"),
                            Button("Osciloscopio (Tiempo)", id="tabOsc", cls="view-tab"),
                            Button("Doble Vista (Ambos)", id="tabBoth", cls="view-tab"),
                            Button("Cascada STFT (3D/2D)", id="tabWaterfall", cls="view-tab"),
                            Button("Laboratorio de Pedales", id="tabPedals", cls="view-tab"),
                            cls="view-tabs"
                        ),
                        Div(
                            Select(
                                Option("Rango Completo (20 Hz - 20 kHz)", value="full"),
                                Option("Zoom Bajos (20 Hz - 2.5 kHz)", value="bass"),
                                id="freqRangeSelect",
                                cls="custom-select"
                            ),
                            Button("💾 Guardar Ref. A", id="btnSaveRef", cls="btn btn-secondary", disabled=True),
                            Button("Δ Curva EQ", id="btnToggleDelta", cls="btn btn-secondary", style="display:none; font-size:0.75rem;", title="Mostrar Curva Diferencial de Ecualización"),
                            Button("✕ Quitar Ref.", id="btnClearRef", cls="btn btn-secondary", style="display:none;"),
                            Button("↺ Reset Picos", id="btnResetPeak", cls="btn btn-secondary", disabled=True),
                            cls="toolbar-actions"
                        ),
                        cls="rack-toolbar"
                    ),

                    # Contenedor de los Canvas
                    Div(
                        Canvas(id="canvasSpectrum"),
                        Canvas(id="canvasOsc", cls="canvas-oscilloscope"),
                        Canvas(id="canvasWaterfall", style="display:none;"),
                        Canvas(id="canvasPedals", style="display:none;"),
                        Div(id="canvasTooltip", cls="canvas-tooltip"),
                        cls="canvas-container"
                    ),

                    # Barra de leyenda inferior
                    Div(
                        Div(Div(cls="legend-color", style="background:#00ff9d;"), Span("Señal Activa"), cls="legend-item"),
                        Div(Div(cls="legend-color", style="background:#f59e0b;"), Span("Retención de Picos (Peak Hold)"), cls="legend-item"),
                        Div(Div(cls="legend-color", style="background:#38bdf8; border-top: 1px dashed #38bdf8;"), Span("Referencia Bypass A/B"), cls="legend-item"),
                        Div(Div(cls="legend-color", style="background:#ec4899;"), Span("Curva Δ EQ"), cls="legend-item"),
                        Div(Div(cls="legend-color", style="background:#38bdf8; opacity:0.5;"), Span("Notas de Bajo"), cls="legend-item"),
                        Div(Div(cls="legend-color", style="background:#ef4444;"), Span("Límite Clipping"), cls="legend-item"),
                        cls="legend-bar"
                    ),
                    cls="display-rack"
                ),

                # Telemetría en Vivo (Bajo la Pantalla)
                Div(
                    Div(
                        Span("Frecuencia Pico / Nota", cls="telemetry-label"),
                        Span("-- Hz", id="livePeakFreq", cls="telemetry-value"),
                        Span("Nota: --", id="livePeakNote", cls="telemetry-sub"),
                        cls="telemetry-card"
                    ),
                    Div(
                        Span("Nivel RMS (Volumen Efectivo)", cls="telemetry-label"),
                        Span("-- dB", id="liveRms", cls="telemetry-value"),
                        Div(Div(cls="meter-fill", id="meterRmsFill"), cls="meter-wrapper", style="margin-top:6px;"),
                        cls="telemetry-card"
                    ),
                    Div(
                        Span("Nivel Pico (Peak Level)", cls="telemetry-label"),
                        Span("-- dB", id="livePeak", cls="telemetry-value"),
                        Span("Margen antes de saturar", cls="telemetry-sub"),
                        cls="telemetry-card"
                    ),
                    Div(
                        Span("Factor de Cresta (Compresión)", cls="telemetry-label"),
                        Span("-- dB", id="liveCrest", cls="telemetry-value"),
                        Span("Menor valor = Mayor compresión", cls="telemetry-sub"),
                        cls="telemetry-card"
                    ),
                    cls="telemetry-rack"
                ),
                cls="visualizer-section"
            ),

            # Barra Lateral de Controles y Diagnóstico
            Section(
                # Panel de Ajustes del Analizador
                Div(
                    Div("⚙ Configuración de Señal", cls="panel-title"),
                    
                    # Ganancia de Entrada
                    Div(
                        Div(
                            Span("Ganancia de Entrada (Preamp)"),
                            Span("1.0x", id="gainVal", cls="val"),
                            cls="control-label"
                        ),
                        Input(type="range", id="gainSlider", min="0.5", max="4.0", step="0.1", value="1.0"),
                        cls="control-group"
                    ),

                    # Resolución FFT
                    Div(
                        Div(
                            Span("Resolución FFT (Tamaño de Bloque)"),
                            cls="control-label"
                        ),
                        Select(
                            Option("1024 puntos (Rápido)", value="1024"),
                            Option("2048 puntos (Estándar)", value="2048"),
                            Option("4096 puntos (Óptimo para Bajo)", value="4096", selected=True),
                            Option("8192 puntos (Ultra Alta Definición)", value="8192"),
                            Option("16384 puntos (Máximo Detalle Subgraves)", value="16384"),
                            id="fftSelect",
                            cls="custom-select",
                            style="width:100%; max-width:none;"
                        ),
                        cls="control-group"
                    ),

                    # Suavizado de Espectro
                    Div(
                        Div(
                            Span("Suavizado Espectral (Inercia)"),
                            Span("0.80", id="smoothVal", cls="val"),
                            cls="control-label"
                        ),
                        Input(type="range", id="smoothSlider", min="0.0", max="0.95", step="0.05", value="0.80"),
                        cls="control-group"
                    ),

                    # Rango Dinámico Mínimo
                    Div(
                        Div(
                            Span("Piso de Ruido (Min dB)"),
                            Span("-96 dB", id="minDbVal", cls="val"),
                            cls="control-label"
                        ),
                        Input(type="range", id="minDbSlider", min="-120", max="-48", step="6", value="-96"),
                        cls="control-group"
                    ),
                    cls="control-panel"
                ),

                # Guía Rápida para Pedales Análogos
                Div(
                    Div("💡 Interpretación de Pedales", cls="panel-title"),
                    Div(
                        P("• ", Span("Compresor: ", style="color:#38bdf8; font-weight:600;"), "Fíjate en el Factor de Cresta. Al activar el pedal, el factor de cresta se reduce (6-8 dB) y los picos en el osciloscopio se aplanan sin dispararse."),
                        P("• ", Span("Overdrive / Fuzz: ", style="color:#f59e0b; font-weight:600;"), "En el espectro FFT verás aparecer espigas en los armónicos múltiplos (2x, 3x, 4x) y en el osciloscopio la onda se recortará en la parte superior/inferior."),
                        P("• ", Span("EQ / Preamp: ", style="color:#00ff9d; font-weight:600;"), "Guarda una curva de referencia en 'Bypass' y luego activa el pedal. Compara visualmente la curva activa contra la línea punteada."),
                        style="font-size:0.75rem; line-height:1.6; color:#94a3b8; display:flex; flex-direction:column; gap:8px;"
                    ),
                    cls="control-panel"
                ),

                # Botón de Instantánea Librosa
                Div(
                    Button(
                        "🔬 Analizar Instantánea con Librosa",
                        id="btnSnapshot",
                        cls="btn btn-accent",
                        style="width: 100%; justify-content: center; padding: 12px; font-size: 0.95rem;",
                        disabled=True
                    ),
                    P("Graba 2 segundos en alta fidelidad y genera el reporte con espectrograma STFT, distorsión THD y armónicos en Python.", style="font-size:0.72rem; color:#64748b; text-align:center; margin-top:8px;"),
                    cls="control-panel",
                    style="background: linear-gradient(180deg, #181c26 0%, #131720 100%); border-color: #3b2d54;"
                ),
                cls="controls-sidebar"
            ),
            cls="main-container"
        ),

        # --- Modal para Reporte de Librosa ---
        Div(
            Div(
                Div(
                    Div("🔬 Análisis Espectral y Diagnóstico de Pedal (Librosa)", cls="modal-title"),
                    Button("✕", id="modalClose", cls="modal-close"),
                    cls="modal-header"
                ),
                Div(
                    Div(
                        Div("Procesando señal con Librosa y SciPy...", style="font-size:1.1rem; color:#38bdf8; margin-bottom:8px;"),
                        P("Calculando Transformada de Fourier de Tiempo Corto (STFT), armónicos y dinámica...", style="color:#94a3b8; font-size:0.85rem;"),
                        id="librosaLoading",
                        style="text-align:center; padding:40px;"
                    ),
                    Div(id="librosaContent", style="display:none;"),
                    cls="modal-body"
                ),
                cls="modal-content"
            ),
            id="modalLibrosa",
            cls="modal-overlay"
        )
    )


# --- Endpoint API para procesar audio grabado con Librosa ---
@rt("/api/analyze", methods=["POST"])
async def analyze_snapshot(req: Request):
    try:
        payload = await req.json()
        b64_audio = payload.get("audio_b64")
        if not b64_audio:
            return JSONResponse({"error": "No se recibió audio en el payload."}, status_code=400)

        audio_bytes = base64.b64decode(b64_audio)
        analysis_result = analyze_audio_buffer(audio_bytes)
        return JSONResponse(analysis_result)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

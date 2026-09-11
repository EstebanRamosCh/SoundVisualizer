import io
import base64
import numpy as np
import scipy.signal
import soundfile as sf
import librosa
import librosa.display
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Diccionario de frecuencias a notas musicales para bajo eléctrico
NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

def hz_to_note(freq_hz):
    if freq_hz <= 15:
        return "N/A"
    # A4 = 440 Hz -> MIDI 69
    midi_num = int(round(69 + 12 * np.log2(freq_hz / 440.0)))
    octave = (midi_num // 12) - 1
    note = NOTE_NAMES[midi_num % 12]
    return f"{note}{octave}"

def analyze_audio_buffer(audio_bytes: bytes):
    """
    Analiza una ráfaga de audio WAV capturada desde el micrófono/interfaz.
    Genera gráficos con Librosa/Matplotlib y calcula métricas de distorsión y dinámica.
    """
    # 1. Cargar el audio desde el buffer binario
    try:
        y, sr = sf.read(io.BytesIO(audio_bytes))
        if y.ndim > 1:
            y = np.mean(y, axis=1) # Convertir a mono
        y = y.astype(np.float32)
    except Exception as e:
        raise ValueError(f"Error al decodificar el audio WAV: {e}")

    duration = len(y) / sr
    if duration < 0.2:
        raise ValueError("La grabación es demasiado corta para el análisis (mínimo 0.2 s).")

    # 2. Métricas de dinámica (Compresión / Nivel)
    peak_val = np.max(np.abs(y)) + 1e-9
    rms_val = np.sqrt(np.mean(y**2)) + 1e-9
    peak_db = float(20 * np.log10(peak_val))
    rms_db = float(20 * np.log10(rms_val))
    crest_factor = float(peak_db - rms_db) # Factor de cresta: indica compresión si es bajo

    # 3. FFT y Espectro promedio con Librosa
    n_fft = 4096 if len(y) >= 4096 else 2048
    hop_length = n_fft // 4
    D = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))
    D_db = librosa.amplitude_to_db(D, ref=np.max)
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    avg_spectrum_mag = np.mean(D, axis=1)
    avg_spectrum_db = librosa.amplitude_to_db(avg_spectrum_mag, ref=np.max)

    # 4. Detección de Frecuencia Fundamental (f0) y Armónicos en rango de bajo (30 Hz - 400 Hz)
    bass_mask = (freqs >= 28) & (freqs <= 400)
    peaks, _ = scipy.signal.find_peaks(avg_spectrum_mag[bass_mask], prominence=0.05 * np.max(avg_spectrum_mag[bass_mask]))
    
    fundamental_hz = 0.0
    fundamental_note = "N/A"
    thd_pct = 0.0
    harmonics_data = []

    if len(peaks) > 0:
        bass_freqs = freqs[bass_mask]
        bass_mags = avg_spectrum_mag[bass_mask]
        dominant_idx = np.argmax(bass_mags[peaks])
        fundamental_hz = float(bass_freqs[peaks[dominant_idx]])
        fundamental_note = hz_to_note(fundamental_hz)

        # Buscar energía en armónicos (2f0, 3f0, 4f0, 5f0)
        f0_mag = bass_mags[peaks[dominant_idx]]
        harmonic_powers = []
        for h in range(2, 7):
            target_f = fundamental_hz * h
            if target_f < sr / 2:
                # Buscar el pico más cercano en una ventana de +/- 10%
                window = (freqs >= target_f * 0.9) & (freqs <= target_f * 1.1)
                if np.any(window):
                    h_mag = np.max(avg_spectrum_mag[window])
                    harmonic_powers.append(h_mag**2)
                    h_db = float(librosa.amplitude_to_db(np.array([h_mag]), ref=f0_mag)[0])
                    harmonics_data.append({
                        "harmonic": f"{h}x ({hz_to_note(target_f)})",
                        "freq": f"{target_f:.1f} Hz",
                        "relative_db": f"{h_db:+.1f} dB"
                    })

        if len(harmonic_powers) > 0 and f0_mag > 0:
            thd = np.sqrt(np.sum(harmonic_powers)) / f0_mag
            thd_pct = float(min(thd * 100, 100.0))

    # 5. Diagnóstico y lectura analógica de pedales
    insights = []
    if crest_factor < 8.0:
        insights.append("[COMPRESIÓN ALTA / SATURACIÓN] El factor de cresta es bajo (~{:.1f} dB), lo que indica que un pedal compresor o saturador está recortando o conteniendo los picos dinámicos.".format(crest_factor))
    elif crest_factor > 14.0:
        insights.append("[DINÁMICA ABIERTA / BAJA COMPRESIÓN] El factor de cresta es alto (~{:.1f} dB), típico de una señal directa de bajo sin compresión excesiva.".format(crest_factor))
    else:
        insights.append("[COMPRESIÓN MODERADA] Rango dinámico equilibrado (~{:.1f} dB).".format(crest_factor))

    if thd_pct > 25.0:
        insights.append(f"[DISTORSIÓN / OVERDRIVE ELEVADA] ({thd_pct:.1f}% THD): Gran densidad de armónicos superiores, típico de un pedal de overdrive, fuzz o preamplificador valvular llevado al límite.")
    elif thd_pct > 8.0:
        insights.append(f"[CALIDEZ ARMÓNICA / SATURACIÓN SUAVE] ({thd_pct:.1f}% THD): Presencia notable de armónicos musicales que añaden presencia y cuerpo al bajo.")
    else:
        insights.append(f"[SEÑAL LIMPIA / FUNDAMENTAL PURA] ({thd_pct:.1f}% THD): Contenido armónico bajo, señal cristalina propia de pastillas pasivas/activas en limpio.")

    # 6. Generar Figura con Matplotlib (Estilo Dark Audio Studio)
    plt.style.use('dark_background')
    fig, axes = plt.subplots(3, 1, figsize=(11, 8.5), gridspec_kw={'height_ratios': [1, 1.4, 1.2]})
    fig.patch.set_facecolor('#0f131a')

    # Panel 1: Forma de Onda en el tiempo (Oscilograma)
    ax0 = axes[0]
    ax0.set_facecolor('#141923')
    times = np.linspace(0, duration, len(y))
    ax0.plot(times, y, color='#00ff9d', linewidth=0.9, alpha=0.9, label='Señal Bajo')
    ax0.axhline(0.9, color='#ef4444', linestyle='--', linewidth=0.8, alpha=0.7, label='Límite Clipping (+0.9)')
    ax0.axhline(-0.9, color='#ef4444', linestyle='--', linewidth=0.8, alpha=0.7)
    ax0.set_title("1. Dominio del Tiempo (Forma de Onda - Nivel y Compresión)", fontsize=11, fontweight='bold', color='#e2e8f0', pad=6)
    ax0.set_xlabel("Tiempo (segundos)", fontsize=9, color='#94a3b8')
    ax0.set_ylabel("Amplitud Normalizada", fontsize=9, color='#94a3b8')
    ax0.set_ylim(-1.05, 1.05)
    ax0.grid(True, color='#252e40', linestyle=':', linewidth=0.7)
    ax0.legend(loc='upper right', fontsize=8, facecolor='#1e293b', edgecolor='#334155')

    # Panel 2: Espectrograma STFT (Cascada de frecuencias en el tiempo)
    ax1 = axes[1]
    ax1.set_facecolor('#141923')
    img = librosa.display.specshow(
        D_db,
        sr=sr,
        hop_length=hop_length,
        x_axis='time',
        y_axis='log',
        ax=ax1,
        cmap='magma'
    )
    ax1.set_ylim(25, 8000) # Enfoque en rango de bajo hasta armónicos
    ax1.set_title("2. Espectrograma STFT (Energía de Frecuencias en el Tiempo - Logarítmico)", fontsize=11, fontweight='bold', color='#e2e8f0', pad=6)
    ax1.set_xlabel("Tiempo (segundos)", fontsize=9, color='#94a3b8')
    ax1.set_ylabel("Frecuencia (Hz)", fontsize=9, color='#94a3b8')
    cbar = fig.colorbar(img, ax=ax1, format="%+2.0f dB", pad=0.02)
    cbar.ax.tick_params(labelsize=8, colors='#94a3b8')

    # Panel 3: Espectro de Potencia Promedio con marcadores de armónicos (FFT estilo SPAN)
    ax2 = axes[2]
    ax2.set_facecolor('#141923')
    ax2.plot(freqs, avg_spectrum_db, color='#38bdf8', linewidth=1.2, label='Espectro FFT')
    
    # Marcar fundamental y armónicos
    if fundamental_hz > 0:
        ax2.axvline(fundamental_hz, color='#22c55e', linestyle='-', linewidth=1.5, label=f'Fundamental f0 ({fundamental_note}: {fundamental_hz:.1f}Hz)')
        for idx, h_item in enumerate(harmonics_data[:4]):
            h_f = float(h_item['freq'].replace(' Hz', ''))
            ax2.axvline(h_f, color='#f59e0b', linestyle='--', linewidth=1.0, alpha=0.85, label=f"{h_item['harmonic']}" if idx == 0 else "")

    ax2.set_xscale('log')
    ax2.set_xlim(25, 10000)
    ax2.set_ylim(-80, 5)
    ax2.set_title("3. Espectro de Potencia y Armónicos (FFT Promediada)", fontsize=11, fontweight='bold', color='#e2e8f0', pad=6)
    ax2.set_xlabel("Frecuencia (Hz) - Escala Logarítmica", fontsize=9, color='#94a3b8')
    ax2.set_ylabel("Magnitud (dB)", fontsize=9, color='#94a3b8')
    ax2.grid(True, which='both', color='#252e40', linestyle=':', linewidth=0.7)
    ax2.legend(loc='upper right', fontsize=8, facecolor='#1e293b', edgecolor='#334155')

    plt.tight_layout()

    # Guardar en buffer de memoria a base64
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=130, facecolor=fig.get_facecolor(), edgecolor='none')
    plt.close(fig)
    buf.seek(0)
    img_b64 = base64.b64encode(buf.read()).decode('utf-8')

    return {
        "image_base64": f"data:image/png;base64,{img_b64}",
        "duration": f"{duration:.2f} s",
        "sample_rate": f"{sr} Hz",
        "peak_db": f"{peak_db:.1f} dBFS",
        "rms_db": f"{rms_db:.1f} dBFS",
        "crest_factor": f"{crest_factor:.1f} dB",
        "fundamental_hz": f"{fundamental_hz:.1f} Hz" if fundamental_hz > 0 else "N/A",
        "fundamental_note": fundamental_note,
        "thd_percent": f"{thd_pct:.1f}%",
        "harmonics": harmonics_data,
        "insights": insights
    }

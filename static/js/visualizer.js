/**
 * Visualizador de Señales y Frecuencias para Bajo Eléctrico y Pedales Análogos
 * Web Audio API Engine & High-Res Canvas Renderer (Estilo Voxengo SPAN)
 */

(function () {
  'use strict';

  // --- Estado Global del Visualizador ---
  const state = {
    audioCtx: null,
    analyser: null,
    sourceNode: null,
    gainNode: null,
    stream: null,
    isRunning: false,
    isFrozen: false,
    fftSize: 4096,
    smoothing: 0.8,
    gainValue: 1.0,
    minDb: -96,
    maxDb: 0,
    zoomBass: false,
    currentView: 'spectrum', // 'spectrum', 'oscilloscope', 'both'
    
    // Arrays de datos
    freqData: null,
    timeData: null,
    peakHoldData: null,
    referenceData: null, // Curva A/B de referencia
    showDeltaEq: false,  // Mostrar curva diferencial delta EQ
    dynamicsHistory: [], // Historial rodante de dinámicas para el compresor
    waterfallCanvas: null, // Buffer offscreen para cascada STFT
    
    // Marcadores de notas de bajo estándar y 5 cuerdas
    bassNotes: [
      { note: 'B0', freq: 30.87, string: '5ta' },
      { note: 'E1', freq: 41.20, string: '4ta' },
      { note: 'A1', freq: 55.00, string: '3ra' },
      { note: 'D2', freq: 73.42, string: '2da' },
      { note: 'G2', freq: 98.00, string: '1ra' },
      { note: 'C3', freq: 130.81, string: 'Agudo' },
      { note: 'E3', freq: 164.81, string: 'Agudo' },
      { note: 'A3', freq: 220.00, string: 'Armónico' },
      { note: 'D4', freq: 293.66, string: 'Armónico' }
    ]
  };

  // --- Elementos del DOM ---
  const dom = {
    audioSource: document.getElementById('audioSource'),
    btnStart: document.getElementById('btnStart'),
    btnFreeze: document.getElementById('btnFreeze'),
    btnResetPeak: document.getElementById('btnResetPeak'),
    btnSaveRef: document.getElementById('btnSaveRef'),
    btnToggleDelta: document.getElementById('btnToggleDelta'),
    btnClearRef: document.getElementById('btnClearRef'),
    btnSnapshot: document.getElementById('btnSnapshot'),
    statusLed: document.getElementById('statusLed'),
    statusText: document.getElementById('statusText'),
    
    // Controles
    gainSlider: document.getElementById('gainSlider'),
    gainVal: document.getElementById('gainVal'),
    fftSelect: document.getElementById('fftSelect'),
    smoothSlider: document.getElementById('smoothSlider'),
    smoothVal: document.getElementById('smoothVal'),
    freqRangeSelect: document.getElementById('freqRangeSelect'),
    minDbSlider: document.getElementById('minDbSlider'),
    minDbVal: document.getElementById('minDbVal'),
    
    // Lienzos Canvas
    canvasSpectrum: document.getElementById('canvasSpectrum'),
    canvasOsc: document.getElementById('canvasOsc'),
    canvasWaterfall: document.getElementById('canvasWaterfall'),
    canvasPedals: document.getElementById('canvasPedals'),
    canvasTooltip: document.getElementById('canvasTooltip'),
    
    // Vistas
    tabSpectrum: document.getElementById('tabSpectrum'),
    tabOsc: document.getElementById('tabOsc'),
    tabBoth: document.getElementById('tabBoth'),
    tabWaterfall: document.getElementById('tabWaterfall'),
    tabPedals: document.getElementById('tabPedals'),
    
    // Telemetría en vivo
    livePeakFreq: document.getElementById('livePeakFreq'),
    livePeakNote: document.getElementById('livePeakNote'),
    liveRms: document.getElementById('liveRms'),
    livePeak: document.getElementById('livePeak'),
    liveCrest: document.getElementById('liveCrest'),
    meterRmsFill: document.getElementById('meterRmsFill'),
    
    // Modal Librosa
    modalLibrosa: document.getElementById('modalLibrosa'),
    modalClose: document.getElementById('modalClose'),
    librosaContent: document.getElementById('librosaContent'),
    librosaLoading: document.getElementById('librosaLoading')
  };

  let ctxSpectrum = null;
  let ctxOsc = null;
  let ctxWaterfall = null;
  let ctxPedals = null;
  let animFrameId = null;

  // --- Inicialización y Event Listeners ---
  window.addEventListener('DOMContentLoaded', () => {
    initCanvases();
    listAudioDevices();
    setupEventListeners();
  });

  function initCanvases() {
    if (dom.canvasSpectrum) {
      ctxSpectrum = dom.canvasSpectrum.getContext('2d');
      resizeCanvas(dom.canvasSpectrum);
    }
    if (dom.canvasOsc) {
      ctxOsc = dom.canvasOsc.getContext('2d');
      resizeCanvas(dom.canvasOsc);
    }
    if (dom.canvasWaterfall) {
      ctxWaterfall = dom.canvasWaterfall.getContext('2d');
      resizeCanvas(dom.canvasWaterfall);
    }
    if (dom.canvasPedals) {
      ctxPedals = dom.canvasPedals.getContext('2d');
      resizeCanvas(dom.canvasPedals);
    }

    const resizeAll = () => {
      resizeCanvas(dom.canvasSpectrum);
      resizeCanvas(dom.canvasOsc);
      resizeCanvas(dom.canvasWaterfall);
      resizeCanvas(dom.canvasPedals);
    };

    // Adaptación dinámica y suave para celulares y giros de pantalla
    const container = document.querySelector('.canvas-container');
    if (container && window.ResizeObserver) {
      const ro = new ResizeObserver(resizeAll);
      ro.observe(container);
    } else {
      window.addEventListener('resize', resizeAll);
    }

    window.addEventListener('orientationchange', () => {
      setTimeout(resizeAll, 150);
    });
  }

  function resizeCanvas(canvas) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }

  async function listAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      
      dom.audioSource.innerHTML = '';
      if (audioInputs.length === 0) {
        dom.audioSource.innerHTML = '<option value="">Micrófono / Entrada por defecto</option>';
        return;
      }

      audioInputs.forEach((dev, idx) => {
        const opt = document.createElement('option');
        opt.value = dev.deviceId;
        opt.text = dev.label || `Entrada de Audio ${idx + 1}`;
        dom.audioSource.appendChild(opt);
      });
    } catch (e) {
      console.warn("No se pudieron enumerar los dispositivos de audio:", e);
    }
  }

  function setupEventListeners() {
    dom.btnStart.addEventListener('click', toggleAudio);
    
    dom.btnFreeze.addEventListener('click', () => {
      state.isFrozen = !state.isFrozen;
      dom.btnFreeze.innerHTML = state.isFrozen ? '▶ Reanudar' : '⏸ Congelar';
      dom.btnFreeze.className = state.isFrozen ? 'btn btn-secondary' : 'btn btn-secondary';
      if (state.isFrozen) {
        dom.statusLed.className = 'status-led paused';
        dom.statusText.textContent = 'CONGELADO';
      } else {
        dom.statusLed.className = 'status-led active';
        dom.statusText.textContent = 'EN VIVO';
      }
    });

    dom.btnResetPeak.addEventListener('click', () => {
      if (state.peakHoldData) {
        state.peakHoldData.fill(-160);
      }
    });

    dom.btnSaveRef.addEventListener('click', () => {
      if (state.freqData) {
        state.referenceData = new Float32Array(state.freqData);
        dom.btnClearRef.style.display = 'inline-flex';
        if (dom.btnToggleDelta) dom.btnToggleDelta.style.display = 'inline-flex';
      }
    });

    dom.btnClearRef.addEventListener('click', () => {
      state.referenceData = null;
      state.showDeltaEq = false;
      dom.btnClearRef.style.display = 'none';
      if (dom.btnToggleDelta) {
        dom.btnToggleDelta.style.display = 'none';
        dom.btnToggleDelta.classList.remove('btn-primary');
        dom.btnToggleDelta.classList.add('btn-secondary');
      }
    });

    if (dom.btnToggleDelta) {
      dom.btnToggleDelta.addEventListener('click', () => {
        state.showDeltaEq = !state.showDeltaEq;
        dom.btnToggleDelta.classList.toggle('btn-primary', state.showDeltaEq);
        dom.btnToggleDelta.classList.toggle('btn-secondary', !state.showDeltaEq);
      });
    }

    // Cambios en Controles
    dom.gainSlider.addEventListener('input', (e) => {
      state.gainValue = parseFloat(e.target.value);
      dom.gainVal.textContent = state.gainValue.toFixed(1) + 'x';
      if (state.gainNode) {
        state.gainNode.gain.setValueAtTime(state.gainValue, state.audioCtx.currentTime);
      }
    });

    dom.smoothSlider.addEventListener('input', (e) => {
      state.smoothing = parseFloat(e.target.value);
      dom.smoothVal.textContent = state.smoothing.toFixed(2);
      if (state.analyser) {
        state.analyser.smoothingTimeConstant = state.smoothing;
      }
    });

    dom.fftSelect.addEventListener('change', (e) => {
      state.fftSize = parseInt(e.target.value, 10);
      if (state.analyser) {
        state.analyser.fftSize = state.fftSize;
        const binCount = state.analyser.frequencyBinCount;
        state.freqData = new Float32Array(binCount);
        state.peakHoldData = new Float32Array(binCount).fill(-160);
        state.referenceData = null;
      }
    });

    dom.freqRangeSelect.addEventListener('change', (e) => {
      state.zoomBass = (e.target.value === 'bass');
    });

    dom.minDbSlider.addEventListener('input', (e) => {
      state.minDb = parseInt(e.target.value, 10);
      dom.minDbVal.textContent = state.minDb + ' dB';
      if (state.analyser) {
        state.analyser.minDecibels = state.minDb;
      }
    });

    // Pestañas de Vista
    dom.tabSpectrum.addEventListener('click', () => switchView('spectrum'));
    dom.tabOsc.addEventListener('click', () => switchView('oscilloscope'));
    dom.tabBoth.addEventListener('click', () => switchView('both'));
    if (dom.tabWaterfall) dom.tabWaterfall.addEventListener('click', () => switchView('waterfall'));
    if (dom.tabPedals) dom.tabPedals.addEventListener('click', () => switchView('pedals'));

    // Tooltip sobre el espectro (Mouse y Pantallas Táctiles)
    dom.canvasSpectrum.addEventListener('mousemove', handleSpectrumTooltip);
    dom.canvasSpectrum.addEventListener('mouseleave', () => {
      dom.canvasTooltip.style.display = 'none';
    });

    // Soporte táctil para celulares
    dom.canvasSpectrum.addEventListener('touchstart', handleSpectrumTooltip, { passive: true });
    dom.canvasSpectrum.addEventListener('touchmove', handleSpectrumTooltip, { passive: true });
    dom.canvasSpectrum.addEventListener('touchend', () => {
      setTimeout(() => {
        dom.canvasTooltip.style.display = 'none';
      }, 1800);
    });

    // Análisis Instantánea Librosa
    dom.btnSnapshot.addEventListener('click', captureAndAnalyzeWithLibrosa);
    dom.modalClose.addEventListener('click', () => {
      dom.modalLibrosa.style.display = 'none';
    });
  }

  function switchView(view) {
    state.currentView = view;
    dom.tabSpectrum.classList.toggle('active', view === 'spectrum');
    dom.tabOsc.classList.toggle('active', view === 'oscilloscope');
    dom.tabBoth.classList.toggle('active', view === 'both');
    if (dom.tabWaterfall) dom.tabWaterfall.classList.toggle('active', view === 'waterfall');
    if (dom.tabPedals) dom.tabPedals.classList.toggle('active', view === 'pedals');

    // Resetear visibilidad de todos los lienzos
    dom.canvasSpectrum.style.display = 'none';
    dom.canvasOsc.style.display = 'none';
    if (dom.canvasWaterfall) dom.canvasWaterfall.style.display = 'none';
    if (dom.canvasPedals) dom.canvasPedals.style.display = 'none';

    if (view === 'spectrum') {
      dom.canvasSpectrum.style.display = 'block';
      dom.canvasSpectrum.style.height = '100%';
      dom.canvasSpectrum.style.top = '0';
    } else if (view === 'oscilloscope') {
      dom.canvasOsc.style.display = 'block';
      dom.canvasOsc.style.height = '100%';
      dom.canvasOsc.style.top = '0';
    } else if (view === 'both') {
      dom.canvasSpectrum.style.display = 'block';
      dom.canvasSpectrum.style.height = '62%';
      dom.canvasSpectrum.style.top = '0';
      dom.canvasOsc.style.display = 'block';
      dom.canvasOsc.style.height = '38%';
      dom.canvasOsc.style.top = '62%';
    } else if (view === 'waterfall') {
      if (dom.canvasWaterfall) {
        dom.canvasWaterfall.style.display = 'block';
        dom.canvasWaterfall.style.height = '100%';
        dom.canvasWaterfall.style.top = '0';
      }
    } else if (view === 'pedals') {
      if (dom.canvasPedals) {
        dom.canvasPedals.style.display = 'block';
        dom.canvasPedals.style.height = '100%';
        dom.canvasPedals.style.top = '0';
      }
    }

    resizeCanvas(dom.canvasSpectrum);
    resizeCanvas(dom.canvasOsc);
    if (dom.canvasWaterfall) resizeCanvas(dom.canvasWaterfall);
    if (dom.canvasPedals) resizeCanvas(dom.canvasPedals);
  }

  // --- Inicio / Parada del Flujo de Audio ---
  async function toggleAudio() {
    if (state.isRunning) {
      stopAudio();
    } else {
      await startAudio();
    }
  }

  async function startAudio() {
    try {
      state.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (state.audioCtx.state === 'suspended') {
        await state.audioCtx.resume();
      }

      // Restricciones de audio crudo sin procesamiento de voz
      const constraints = {
        audio: {
          deviceId: dom.audioSource.value ? { exact: dom.audioSource.value } : undefined,
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
          channelCount: 1,
          latency: 0
        }
      };

      state.stream = await navigator.mediaDevices.getUserMedia(constraints);
      listAudioDevices(); // Actualizar nombres si ahora tienen permisos

      state.sourceNode = state.audioCtx.createMediaStreamSource(state.stream);
      state.gainNode = state.audioCtx.createGain();
      state.gainNode.gain.setValueAtTime(state.gainValue, state.audioCtx.currentTime);

      state.analyser = state.audioCtx.createAnalyser();
      state.analyser.fftSize = state.fftSize;
      state.analyser.smoothingTimeConstant = state.smoothing;
      state.analyser.minDecibels = state.minDb;
      state.analyser.maxDecibels = state.maxDb;

      // Cadena de audio: Fuente -> Ganancia -> Analizador
      state.sourceNode.connect(state.gainNode);
      state.gainNode.connect(state.analyser);

      const binCount = state.analyser.frequencyBinCount;
      state.freqData = new Float32Array(binCount);
      state.timeData = new Uint8Array(state.analyser.fftSize);
      state.peakHoldData = new Float32Array(binCount).fill(-160);

      state.isRunning = true;
      dom.btnStart.innerHTML = '⏹ Detener';
      dom.btnStart.className = 'btn btn-danger';
      dom.statusLed.className = 'status-led active';
      dom.statusText.textContent = 'EN VIVO';
      dom.btnFreeze.disabled = false;
      dom.btnSnapshot.disabled = false;
      dom.btnSaveRef.disabled = false;
      dom.btnResetPeak.disabled = false;

      renderLoop();
    } catch (err) {
      console.error("Error al acceder a la entrada de audio:", err);
      alert("No se pudo acceder a la entrada de audio: " + err.message);
      stopAudio();
    }
  }

  function stopAudio() {
    state.isRunning = false;
    if (animFrameId) cancelAnimationFrame(animFrameId);

    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop());
      state.stream = null;
    }
    if (state.audioCtx) {
      state.audioCtx.close();
      state.audioCtx = null;
    }

    dom.btnStart.innerHTML = '🎤 Conectar Bajo';
    dom.btnStart.className = 'btn btn-primary';
    dom.statusLed.className = 'status-led';
    dom.statusText.textContent = 'DESCONECTADO';
    dom.btnFreeze.disabled = true;
    dom.btnSnapshot.disabled = true;
    dom.btnSaveRef.disabled = true;
    dom.btnResetPeak.disabled = true;

    // Limpiar lienzos
    if (ctxSpectrum && dom.canvasSpectrum) {
      ctxSpectrum.clearRect(0, 0, dom.canvasSpectrum.width, dom.canvasSpectrum.height);
    }
    if (ctxOsc && dom.canvasOsc) {
      ctxOsc.clearRect(0, 0, dom.canvasOsc.width, dom.canvasOsc.height);
    }
  }

  // --- Ciclo Principal de Renderizado (60 FPS) ---
  function renderLoop() {
    if (!state.isRunning) return;

    if (!state.isFrozen) {
      state.analyser.getFloatFrequencyData(state.freqData);
      state.analyser.getByteTimeDomainData(state.timeData);
      updateTelemetryAndMeters();
    }

    if (state.currentView === 'spectrum' || state.currentView === 'both') {
      drawSpectrum();
    }
    if (state.currentView === 'oscilloscope' || state.currentView === 'both') {
      drawOscilloscope();
    }
    if (state.currentView === 'waterfall') {
      drawWaterfall();
    }
    if (state.currentView === 'pedals') {
      drawPedalsLab();
    }

    animFrameId = requestAnimationFrame(renderLoop);
  }

  // --- Telemetría en Tiempo Real y Medidores ---
  function updateTelemetryAndMeters() {
    if (!state.freqData || !state.timeData) return;

    const sampleRate = state.audioCtx.sampleRate;
    const binWidth = sampleRate / state.fftSize;

    // 1. Detección de Frecuencia Pico en rango de bajo (30 Hz - 450 Hz)
    const minBin = Math.floor(30 / binWidth);
    const maxBin = Math.floor(450 / binWidth);
    let maxDb = -160;
    let peakBin = -1;

    for (let i = minBin; i <= maxBin && i < state.freqData.length; i++) {
      if (state.freqData[i] > maxDb) {
        maxDb = state.freqData[i];
        peakBin = i;
      }
    }

    if (peakBin > 0 && maxDb > -65) {
      const peakFreq = peakBin * binWidth;
      dom.livePeakFreq.textContent = peakFreq.toFixed(1) + ' Hz';
      dom.livePeakNote.textContent = findClosestBassNote(peakFreq);
    } else {
      dom.livePeakFreq.textContent = '-- Hz';
      dom.livePeakNote.textContent = '--';
    }

    // 2. Cálculo de RMS, Pico y Crest Factor desde timeData
    let sumSquares = 0;
    let peakSample = 0;
    for (let i = 0; i < state.timeData.length; i++) {
      const val = (state.timeData[i] - 128) / 128.0; // [-1.0, 1.0]
      sumSquares += val * val;
      const absVal = Math.abs(val);
      if (absVal > peakSample) peakSample = absVal;
    }

    const rms = Math.sqrt(sumSquares / state.timeData.length) + 1e-6;
    const rmsDb = Math.max(-96, 20 * Math.log10(rms));
    const peakDb = Math.max(-96, 20 * Math.log10(peakSample + 1e-6));
    const crestFactor = Math.max(0, peakDb - rmsDb);

    dom.liveRms.textContent = rmsDb.toFixed(1) + ' dB';
    dom.livePeak.textContent = peakDb.toFixed(1) + ' dB';
    dom.liveCrest.textContent = crestFactor.toFixed(1) + ' dB';

    // Guardar en historial rodante para el osciloscopio del compresor
    state.dynamicsHistory.push({ peakDb, rmsDb, crestFactor });
    if (state.dynamicsHistory.length > 180) {
      state.dynamicsHistory.shift();
    }

    // Barra de medidor
    const meterPct = Math.min(100, Math.max(0, (rmsDb + 60) * (100 / 60)));
    dom.meterRmsFill.style.width = meterPct + '%';
  }

  function findClosestBassNote(freq) {
    if (freq <= 18) return '--';
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    const note = noteNames[(midi % 12 + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    return `${note}${octave}`;
  }

  // --- Renderizado del Espectro FFT (Estilo Voxengo SPAN) ---
  function drawSpectrum() {
    const canvas = dom.canvasSpectrum;
    const ctx = ctxSpectrum;
    const width = canvas.getBoundingClientRect().width;
    const height = canvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, width, height);

    // Fondo del analizador
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, width, height);

    const fMin = 20;
    const fMax = state.zoomBass ? 2500 : 20000;
    const minDb = state.minDb;
    const maxDb = state.maxDb;
    const sampleRate = state.audioCtx.sampleRate;
    const binCount = state.analyser.frequencyBinCount;
    const binWidth = sampleRate / state.fftSize;

    // Conversión Logarítmica Hz <-> X
    const freqToX = (f) => {
      const clampF = Math.max(fMin, Math.min(fMax, f));
      return (Math.log10(clampF / fMin) / Math.log10(fMax / fMin)) * width;
    };

    const dbToY = (db) => {
      const clampDb = Math.max(minDb, Math.min(maxDb, db));
      return height - ((clampDb - minDb) / (maxDb - minDb)) * height;
    };

    // 1. Dibujar Cuadrícula de dB
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillStyle = '#64748b';
    ctx.font = width < 520 ? '9px monospace' : '10px monospace';
    ctx.textAlign = 'right';

    const dbStep = (height < 260 || width < 480) ? 24 : 12;
    for (let db = maxDb; db >= minDb; db -= dbStep) {
      const y = dbToY(db);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
      ctx.fillText(`${db} dB`, width - 6, y - 4);
    }

    // 2. Dibujar Cuadrícula de Frecuencias (Hz) adaptativa para celulares
    let gridFreqs;
    if (width < 520) {
      gridFreqs = state.zoomBass
        ? [40, 80, 150, 300, 700, 1500]
        : [40, 100, 300, 1000, 3000, 10000];
    } else {
      gridFreqs = state.zoomBass
        ? [30, 40, 60, 80, 100, 150, 200, 300, 500, 700, 1000, 1500, 2000]
        : [30, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
    }

    ctx.textAlign = 'center';
    gridFreqs.forEach(f => {
      if (f >= fMin && f <= fMax) {
        const x = freqToX(f);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
        const label = f >= 1000 ? `${f / 1000}k` : `${f}`;
        ctx.fillText(label, x, height - 6);
      }
    });

    // 3. Marcadores de Notas de Bajo (B0, E1, A1, D2, G2)
    state.bassNotes.forEach(bNote => {
      if (bNote.freq >= fMin && bNote.freq <= fMax) {
        const x = freqToX(bNote.freq);
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 16);
        ctx.lineTo(x, height - 18);
        ctx.stroke();

        ctx.fillStyle = '#38bdf8';
        ctx.font = width < 520 ? 'bold 8px monospace' : 'bold 9px monospace';
        ctx.fillText(bNote.note, x, 13);
        ctx.restore();
      }
    });

    // 4. Dibujar Curva de Referencia A/B (si existe)
    if (state.referenceData) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let first = true;
      for (let px = 0; px < width; px += 2) {
        const f = fMin * Math.pow(fMax / fMin, px / width);
        const bin = Math.round(f / binWidth);
        if (bin < state.referenceData.length) {
          const y = dbToY(state.referenceData[bin]);
          if (first) {
            ctx.moveTo(px, y);
            first = false;
          } else {
            ctx.lineTo(px, y);
          }
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 4b. Dibujar Curva Diferencial Delta EQ (Δ dB = Activo - Bypass)
    if (state.showDeltaEq && state.referenceData) {
      ctx.save();
      const midY = height / 2;
      // Línea central de 0 dB diferencial
      ctx.strokeStyle = 'rgba(236, 72, 153, 0.4)';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.2;
      ctx.shadowColor = '#ec4899';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      let firstDelta = true;

      for (let px = 0; px < width; px += 2) {
        const f = fMin * Math.pow(fMax / fMin, px / width);
        const bin = Math.round(f / binWidth);
        if (bin < state.freqData.length && bin < state.referenceData.length) {
          const deltaDb = state.freqData[bin] - state.referenceData[bin];
          // Rango visual +/- 18 dB
          const clampDelta = Math.max(-18, Math.min(18, deltaDb));
          const y = midY - (clampDelta / 18) * (height * 0.4);
          if (firstDelta) {
            ctx.moveTo(px, y);
            firstDelta = false;
          } else {
            ctx.lineTo(px, y);
          }
        }
      }
      ctx.stroke();
      ctx.restore();
    }

    // 5. Dibujar Curva de Retención de Picos (Peak Hold - Ámbar)
    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let firstPeak = true;

    for (let px = 0; px < width; px += 2) {
      const f = fMin * Math.pow(fMax / fMin, px / width);
      const bin = Math.round(f / binWidth);
      if (bin < binCount) {
        // Actualizar peak hold con decaimiento muy lento
        if (state.freqData[bin] > state.peakHoldData[bin]) {
          state.peakHoldData[bin] = state.freqData[bin];
        } else {
          state.peakHoldData[bin] -= 0.04; // Decaimiento suave
        }

        const y = dbToY(state.peakHoldData[bin]);
        if (firstPeak) {
          ctx.moveTo(px, y);
          firstPeak = false;
        } else {
          ctx.lineTo(px, y);
        }
      }
    }
    ctx.stroke();
    ctx.restore();

    // 6. Dibujar Curva Activa en Tiempo Real (Verde Neón Fósforo)
    ctx.save();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, 'rgba(0, 255, 157, 0.35)');
    grad.addColorStop(0.7, 'rgba(0, 255, 157, 0.08)');
    grad.addColorStop(1, 'rgba(0, 255, 157, 0.0)');

    ctx.strokeStyle = '#00ff9d';
    ctx.lineWidth = 1.8;
    ctx.shadowColor = '#00ff9d';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    let firstPt = true;
    for (let px = 0; px < width; px += 2) {
      const f = fMin * Math.pow(fMax / fMin, px / width);
      const bin = Math.round(f / binWidth);
      if (bin < binCount) {
        const y = dbToY(state.freqData[bin]);
        if (firstPt) {
          ctx.moveTo(px, y);
          firstPt = false;
        } else {
          ctx.lineTo(px, y);
        }
      }
    }
    ctx.stroke();

    // Relleno bajo la curva
    ctx.shadowBlur = 0;
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  // --- Renderizado del Osciloscopio en el Tiempo ---
  function drawOscilloscope() {
    const canvas = dom.canvasOsc;
    const ctx = ctxOsc;
    const width = canvas.getBoundingClientRect().width;
    const height = canvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, width, height);

    // Líneas de referencia y límite de clipping
    const midY = height / 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    // Líneas rojas de clipping (+0.95 / -0.95)
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.05);
    ctx.lineTo(width, height * 0.05);
    ctx.moveTo(0, height * 0.95);
    ctx.lineTo(width, height * 0.95);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!state.timeData) return;

    // Trigger de sincronización por cruce por cero (Zero-crossing) para estabilizar la onda
    let triggerIdx = 0;
    for (let i = 0; i < state.timeData.length / 2; i++) {
      if (state.timeData[i] < 128 && state.timeData[i + 1] >= 128) {
        triggerIdx = i;
        break;
      }
    }

    const sliceLen = Math.min(width, state.timeData.length - triggerIdx);
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0;
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    for (let i = 0; i < sliceLen; i++) {
      const v = state.timeData[triggerIdx + i] / 128.0;
      const y = (v * height) / 2;
      const x = (i / sliceLen) * width;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // --- Renderizado de Cascada STFT en Tiempo Real (Waterfall Spectrogram) ---
  function drawWaterfall() {
    const canvas = dom.canvasWaterfall;
    const ctx = ctxWaterfall;
    if (!canvas || !ctx || !state.freqData) return;

    const width = Math.floor(canvas.getBoundingClientRect().width);
    const height = Math.floor(canvas.getBoundingClientRect().height);
    if (width <= 0 || height <= 0) return;

    if (!state.waterfallCanvas || state.waterfallCanvas.width !== width || state.waterfallCanvas.height !== height) {
      state.waterfallCanvas = document.createElement('canvas');
      state.waterfallCanvas.width = width;
      state.waterfallCanvas.height = height;
      const offInitCtx = state.waterfallCanvas.getContext('2d');
      offInitCtx.fillStyle = '#080a10';
      offInitCtx.fillRect(0, 0, width, height);
    }
    const offCtx = state.waterfallCanvas.getContext('2d');

    // Desplazar las filas previas 1 pixel hacia abajo
    offCtx.drawImage(state.waterfallCanvas, 0, 1);

    // Escribir nueva fila en y=0
    const imgData = offCtx.createImageData(width, 1);
    const data = imgData.data;

    const fMin = 20;
    const fMax = state.zoomBass ? 2500 : 20000;
    const sampleRate = state.audioCtx ? state.audioCtx.sampleRate : 44100;
    const binWidth = sampleRate / state.fftSize;

    for (let x = 0; x < width; x++) {
      const f = fMin * Math.pow(fMax / fMin, x / width);
      const bin = Math.round(f / binWidth);
      const db = (bin < state.freqData.length) ? state.freqData[bin] : -120;

      // Normalizar dB [-90, -10]
      const norm = Math.max(0, Math.min(1, (db + 90) / 80));
      const color = getHeatmapColor(norm);

      const idx = x * 4;
      data[idx] = color.r;
      data[idx + 1] = color.g;
      data[idx + 2] = color.b;
      data[idx + 3] = 255;
    }
    offCtx.putImageData(imgData, 0, 0);

    // Dibujar en el canvas principal
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(state.waterfallCanvas, 0, 0);

    // Líneas guía de notas de bajo tenues
    state.bassNotes.forEach(bNote => {
      if (bNote.freq >= fMin && bNote.freq <= fMax) {
        const x = (Math.log10(bNote.freq / fMin) / Math.log10(fMax / fMin)) * width;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();

        ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(bNote.note, x, 14);
        ctx.restore();
      }
    });
  }

  function getHeatmapColor(val) {
    if (val <= 0.05) return { r: 8, g: 10, b: 16 };
    if (val < 0.3) {
      const t = (val - 0.05) / 0.25;
      return { r: Math.round(20 * t), g: Math.round(30 + 40 * t), b: Math.round(90 + 130 * t) };
    } else if (val < 0.6) {
      const t = (val - 0.3) / 0.3;
      return { r: Math.round(100 + 130 * t), g: Math.round(20 + 30 * t), b: Math.round(180 - 100 * t) };
    } else if (val < 0.85) {
      const t = (val - 0.6) / 0.25;
      return { r: Math.round(230 + 25 * t), g: Math.round(80 + 130 * t), b: 20 };
    } else {
      const t = (val - 0.85) / 0.15;
      return { r: 255, g: Math.round(210 + 45 * t), b: Math.round(80 + 175 * t) };
    }
  }

  // --- Renderizado del Laboratorio de Pedales (Armónicos, Dinámica y Delta EQ) ---
  function drawPedalsLab() {
    const canvas = dom.canvasPedals;
    const ctx = ctxPedals;
    if (!canvas || !ctx || !state.freqData) return;

    const width = canvas.getBoundingClientRect().width;
    const height = canvas.getBoundingClientRect().height;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#080a0f';
    ctx.fillRect(0, 0, width, height);

    const isNarrow = width < 700;
    const leftW = isNarrow ? width : Math.floor(width * 0.52);
    const rightX = isNarrow ? 0 : leftW + 8;
    const rightW = isNarrow ? width : width - rightX;

    // =========================================================================
    // PANEL 1: MÓDULO OVERDRIVE & DISTORSIÓN (Armónicos y Simetría)
    // =========================================================================
    const panelH = isNarrow ? Math.floor(height * 0.52) : height;
    ctx.fillStyle = '#0f131d';
    ctx.fillRect(4, 4, leftW - 8, panelH - 8);
    ctx.strokeStyle = '#1e2636';
    ctx.strokeRect(4, 4, leftW - 8, panelH - 8);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🔥 OVERDRIVE & DISTORSIÓN: ARMÓNICOS (1x - 6x) Y SIMETRÍA', 12, 18);

    const sampleRate = state.audioCtx ? state.audioCtx.sampleRate : 44100;
    const binWidth = sampleRate / state.fftSize;

    // Detectar fundamental f0 en rango de bajo (30 Hz - 350 Hz)
    let f0 = 0;
    let maxDb = -160;
    const minBin = Math.floor(30 / binWidth);
    const maxBin = Math.floor(350 / binWidth);

    for (let i = minBin; i <= maxBin && i < state.freqData.length; i++) {
      if (state.freqData[i] > maxDb) {
        maxDb = state.freqData[i];
        f0 = i * binWidth;
      }
    }
    if (maxDb < -65) f0 = 55.0; // Valor fallback cuerda A si hay silencio

    const harmonics = [];
    let evenEnergy = 0;
    let oddEnergy = 0;

    for (let h = 1; h <= 6; h++) {
      const targetF = f0 * h;
      const targetBin = Math.round(targetF / binWidth);
      let hDb = -100;
      if (targetBin < state.freqData.length) {
        for (let b = Math.max(0, targetBin - 3); b <= Math.min(state.freqData.length - 1, targetBin + 3); b++) {
          if (state.freqData[b] > hDb) hDb = state.freqData[b];
        }
      }
      const power = Math.pow(10, hDb / 20);
      if (h === 2 || h === 4 || h === 6) evenEnergy += power * power;
      if (h === 3 || h === 5) oddEnergy += power * power;

      harmonics.push({
        num: h,
        freq: targetF,
        note: findClosestBassNote(targetF),
        db: hDb,
        isEven: (h % 2 === 0)
      });
    }

    // Dibujar 6 barras
    const barAreaX = 12;
    const barAreaY = 28;
    const barAreaW = leftW - 24;
    const barAreaH = panelH - 74;
    const barGap = 6;
    const barW = Math.floor((barAreaW - (harmonics.length - 1) * barGap) / harmonics.length);

    harmonics.forEach((h, idx) => {
      const bx = barAreaX + idx * (barW + barGap);
      const normH = Math.max(0, Math.min(1, (h.db + 90) / 80));
      const bh = normH * (barAreaH - 24);
      const by = barAreaY + (barAreaH - 24) - bh;
      const barColor = h.num === 1 ? '#00ff9d' : (h.isEven ? '#38bdf8' : '#f59e0b');

      ctx.fillStyle = '#141a24';
      ctx.fillRect(bx, barAreaY, barW, barAreaH - 24);

      ctx.fillStyle = barColor;
      ctx.fillRect(bx, by, barW, bh);

      ctx.fillStyle = '#cbd5e1';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${h.num}x`, bx + barW / 2, barAreaY + barAreaH - 12);
      ctx.fillStyle = barColor;
      ctx.fillText(h.note, bx + barW / 2, barAreaY + barAreaH - 2);

      if (bh > 14) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '8px monospace';
        ctx.fillText(`${Math.round(h.db)}`, bx + barW / 2, by + 10);
      }
    });

    // Medidor de Balance Armónicos Pares vs Impares
    const meterY = panelH - 26;
    const meterW = leftW - 24;
    const totalHarmonic = evenEnergy + oddEnergy + 1e-9;
    const evenRatio = evenEnergy / totalHarmonic;

    ctx.fillStyle = '#64748b';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Asimétrico (Válvulas/Pares)', barAreaX, meterY);
    ctx.textAlign = 'right';
    ctx.fillText('Simétrico (Fuzz/Impares)', barAreaX + meterW, meterY);

    ctx.fillStyle = '#141a24';
    ctx.fillRect(barAreaX, meterY + 3, meterW, 6);
    ctx.fillStyle = evenRatio > 0.52 ? '#38bdf8' : (evenRatio < 0.48 ? '#f59e0b' : '#10b981');
    const thumbX = barAreaX + Math.max(0, Math.min(meterW - 14, evenRatio * meterW - 7));
    ctx.fillRect(thumbX, meterY + 2, 14, 8);

    // =========================================================================
    // PANEL 2: MÓDULO COMPRESOR (Historial de Envolvente y Dinámica)
    // =========================================================================
    const compY = isNarrow ? panelH + 4 : 4;
    const compH = isNarrow ? Math.floor(height * 0.24) : Math.floor(height * 0.48);

    ctx.fillStyle = '#0f131d';
    ctx.fillRect(rightX + 4, compY, rightW - 8, compH);
    ctx.strokeStyle = '#1e2636';
    ctx.strokeRect(rightX + 4, compY, rightW - 8, compH);

    ctx.fillStyle = '#00ff9d';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🎛 COMPRESOR: HISTORIAL DE ENVOLVENTE DINÁMICA', rightX + 12, compY + 16);

    const hist = state.dynamicsHistory;
    if (hist && hist.length > 1) {
      const histW = rightW - 24;
      const histH = compH - 28;
      const startX = rightX + 12;
      const startY = compY + 22;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.moveTo(startX, startY + histH);
      ctx.lineTo(startX + histW, startY + histH);
      ctx.stroke();

      // Curva Pico (Verde)
      ctx.beginPath();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < hist.length; i++) {
        const x = startX + (i / (hist.length - 1)) * histW;
        const norm = Math.max(0, Math.min(1, (hist[i].peakDb + 80) / 80));
        const y = startY + histH - norm * histH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Curva RMS (Azul)
      ctx.beginPath();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < hist.length; i++) {
        const x = startX + (i / (hist.length - 1)) * histW;
        const norm = Math.max(0, Math.min(1, (hist[i].rmsDb + 80) / 80));
        const y = startY + histH - norm * histH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('Pico (Verde) / RMS (Azul)', startX + histW, startY + 10);
    }

    // =========================================================================
    // PANEL 3: MÓDULO ECUALIZADOR (Respuesta Diferencial Δ EQ)
    // =========================================================================
    const eqY = isNarrow ? compY + compH + 4 : Math.floor(height * 0.52);
    const eqH = isNarrow ? Math.max(80, height - eqY - 4) : height - eqY - 8;

    ctx.fillStyle = '#0f131d';
    ctx.fillRect(rightX + 4, eqY, rightW - 8, eqH);
    ctx.strokeStyle = '#1e2636';
    ctx.strokeRect(rightX + 4, eqY, rightW - 8, eqH);

    ctx.fillStyle = '#ec4899';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('📊 ECUALIZADOR: CURVA DIFERENCIAL Δ EQ (ACTIVO vs BYPASS)', rightX + 12, eqY + 16);

    if (state.referenceData && state.freqData) {
      const eqW = rightW - 24;
      const startX = rightX + 12;
      const startY = eqY + 22;
      const innerH = eqH - 28;
      const midY = startY + innerH / 2;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(startX, midY);
      ctx.lineTo(startX + eqW, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.fillText('0 dB (Bypass)', startX + eqW, midY - 3);

      const fMin = 20;
      const fMax = state.zoomBass ? 2500 : 20000;

      ctx.save();
      ctx.beginPath();
      let first = true;
      for (let px = 0; px < eqW; px += 2) {
        const f = fMin * Math.pow(fMax / fMin, px / eqW);
        const bin = Math.round(f / binWidth);
        if (bin < state.freqData.length && bin < state.referenceData.length) {
          const deltaDb = state.freqData[bin] - state.referenceData[bin];
          const clampDelta = Math.max(-18, Math.min(18, deltaDb));
          const y = midY - (clampDelta / 18) * (innerH / 2);
          if (first) {
            ctx.moveTo(startX + px, y);
            first = false;
          } else {
            ctx.lineTo(startX + px, y);
          }
        }
      }
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.0;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = '#64748b';
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💡 Guarda una Referencia Bypass ("Guardar Ref. A")', rightX + rightW / 2, eqY + eqH / 2 - 4);
      ctx.fillText('para ver los cortes y realces de tu EQ en tiempo real.', rightX + rightW / 2, eqY + eqH / 2 + 10);
    }
  }

  // --- Tooltip de Frecuencia en el Canvas (Mouse y Pantallas Táctiles) ---
  function handleSpectrumTooltip(e) {
    if (!state.isRunning || state.currentView === 'oscilloscope') return;
    const rect = dom.canvasSpectrum.getBoundingClientRect();

    let clientX, clientY;
    const isTouch = Boolean(e.touches && e.touches.length > 0);
    if (isTouch) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    if (clientX === undefined || clientY === undefined) return;

    const mouseX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const mouseY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    const width = rect.width;
    const height = rect.height;

    const fMin = 20;
    const fMax = state.zoomBass ? 2500 : 20000;
    const freq = fMin * Math.pow(fMax / fMin, mouseX / width);
    const db = state.maxDb - (mouseY / height) * (state.maxDb - state.minDb);
    const note = findClosestBassNote(freq);

    dom.canvasTooltip.style.display = 'block';

    // Evitar que el tooltip se corte en los bordes y posicionarlo cómodamente arriba del dedo
    const clampedX = Math.max(50, Math.min(width - 50, mouseX));
    const tipY = isTouch ? Math.max(35, mouseY - 50) : Math.max(25, mouseY - 25);

    dom.canvasTooltip.style.left = `${clampedX}px`;
    dom.canvasTooltip.style.top = `${tipY}px`;
    dom.canvasTooltip.innerHTML = `<strong>${freq.toFixed(1)} Hz</strong> (${note})<br><span style="color:#94a3b8;">${db.toFixed(1)} dB</span>`;
  }

  // --- Instantánea y Análisis Profundo con Librosa (Backend) ---
  async function captureAndAnalyzeWithLibrosa() {
    if (!state.isRunning) return;

    dom.modalLibrosa.style.display = 'flex';
    dom.librosaLoading.style.display = 'block';
    dom.librosaContent.style.display = 'none';

    try {
      // Grabar 2 segundos de audio en búfer PCM
      const recordCtx = new (window.AudioContext || window.webkitAudioContext)();
      const recStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: dom.audioSource.value ? { exact: dom.audioSource.value } : undefined,
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false
        }
      });

      const recSource = recordCtx.createMediaStreamSource(recStream);
      const scriptProcessor = recordCtx.createScriptProcessor(4096, 1, 1);
      const audioChunks = [];
      const targetSamples = recordCtx.sampleRate * 2.0; // 2 segundos
      let recordedSamples = 0;

      scriptProcessor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        audioChunks.push(new Float32Array(input));
        recordedSamples += input.length;
        if (recordedSamples >= targetSamples) {
          scriptProcessor.disconnect();
          recSource.disconnect();
          recStream.getTracks().forEach(t => t.stop());
          finishAndSendSnapshot(audioChunks, recordedSamples, recordCtx.sampleRate);
          recordCtx.close();
        }
      };

      recSource.connect(scriptProcessor);
      scriptProcessor.connect(recordCtx.destination);

    } catch (err) {
      console.error("Error al capturar instantánea:", err);
      dom.librosaLoading.innerHTML = `<p style="color:#ef4444;">Error: ${err.message}</p>`;
    }
  }

  async function finishAndSendSnapshot(chunks, totalSamples, sampleRate) {
    // 1. Unir chunks en un solo Float32Array
    const merged = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // 2. Codificar a WAV mono 16-bit
    const wavBlob = encodeWAV(merged, sampleRate);
    const reader = new FileReader();
    reader.readAsDataURL(wavBlob);
    reader.onloadend = async () => {
      const base64Audio = reader.result.split(',')[1];
      
      try {
        const resp = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_b64: base64Audio })
        });

        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }

        const data = await resp.json();
        if (data.error) {
          throw new Error(data.error);
        }
        displayLibrosaResults(data);
      } catch (e) {
        // En despliegue autónomo de Netlify o si el backend Python está apagado,
        // generar el diagnóstico dinámico y oscilograma en el cliente sin error:
        console.warn("Backend /api/analyze no disponible, generando diagnóstico en el cliente para Netlify:", e);
        displayClientSideSnapshotReport(merged, sampleRate);
      }
    };
  }

  function displayClientSideSnapshotReport(samples, sampleRate) {
    // 1. Dinámica y factor de cresta de la señal capturada
    let peakVal = 0;
    let sumSq = 0;
    for (let i = 0; i < samples.length; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peakVal) peakVal = abs;
      sumSq += samples[i] * samples[i];
    }
    const rmsVal = Math.sqrt(sumSq / (samples.length || 1)) + 1e-6;
    const peakDb = Math.max(-96, 20 * Math.log10(peakVal + 1e-6)).toFixed(1);
    const rmsDb = Math.max(-96, 20 * Math.log10(rmsVal)).toFixed(1);
    const crestFactor = Math.max(0, peakDb - rmsDb).toFixed(1);

    // 2. Fundamental y nota detectada
    const fundamentalNote = dom.livePeakNote && dom.livePeakNote.textContent !== '--' 
      ? dom.livePeakNote.textContent 
      : (state.peakNote || 'N/A');
    const fundamentalHz = dom.livePeakFreq && dom.livePeakFreq.textContent !== '-- Hz'
      ? dom.livePeakFreq.textContent
      : (state.peakFreq > 0 ? `${state.peakFreq.toFixed(1)} Hz` : 'N/A');

    // 3. Estimar THD y armónicos si están disponibles
    let thdPct = '0.0%';
    const harmonics = [];
    const f0 = parseFloat(fundamentalHz);
    if (!isNaN(f0) && f0 > 25 && state.freqData) {
      const binWidth = sampleRate / state.fftSize;
      const f0Bin = Math.round(f0 / binWidth);
      const f0Mag = f0Bin < state.freqData.length ? state.freqData[f0Bin] : -50;

      let harmonicPowerSum = 0;
      for (let h = 2; h <= 6; h++) {
        const targetF = f0 * h;
        if (targetF < sampleRate / 2) {
          const hBin = Math.round(targetF / binWidth);
          if (hBin < state.freqData.length) {
            const hDb = state.freqData[hBin];
            const relDb = (hDb - f0Mag).toFixed(1);
            const linearRel = Math.pow(10, (hDb - f0Mag) / 20);
            harmonicPowerSum += linearRel * linearRel;
            harmonics.push({
              harmonic: `${h}x (${findClosestBassNote(targetF)})`,
              freq: `${targetF.toFixed(1)} Hz`,
              relative_db: `${relDb > 0 ? '+' : ''}${relDb} dB`
            });
          }
        }
      }
      const thd = Math.min(100, Math.sqrt(harmonicPowerSum) * 100);
      thdPct = `${thd.toFixed(1)}%`;
    }

    // 4. Diagnóstico de pedales
    const insights = [];
    const crestNum = parseFloat(crestFactor);
    if (crestNum < 8.0) {
      insights.push(`[COMPRESIÓN ALTA / SATURACIÓN] El factor de cresta es bajo (~${crestFactor} dB), indicando que un pedal compresor o saturador está recortando o conteniendo los picos dinámicos.`);
    } else if (crestNum > 14.0) {
      insights.push(`[DINÁMICA AMPLIA / BYPASS] El factor de cresta es elevado (~${crestFactor} dB), típico de una señal limpia con rango dinámico completo.`);
    } else {
      insights.push(`[DINÁMICA BALANCEADA] Factor de cresta moderado (~${crestFactor} dB), respuesta natural entre ataque y sostenido.`);
    }

    if (parseFloat(thdPct) > 18.0) {
      insights.push(`[DISTORSIÓN / OVERDRIVE DETECTADO] Alto contenido de sobretonos armónicos (THD ~${thdPct}), característico de saturación, fuzz o distorsión.`);
    } else {
      insights.push(`[SEÑAL LIMPIA] Nivel armónico contenido (THD ~${thdPct}), preservando la pureza de la nota fundamental.`);
    }

    // 5. Generar gráfico de forma de onda en canvas offscreen
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 640;
    offCanvas.height = 280;
    const ctx = offCanvas.getContext('2d');

    // Fondo Rack Audio
    ctx.fillStyle = '#0f141c';
    ctx.fillRect(0, 0, 640, 280);

    // Rejilla de osciloscopio
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 640; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 280); ctx.stroke();
    }
    for (let y = 0; y <= 280; y += 35) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(640, y); ctx.stroke();
    }

    // Eje central
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, 140); ctx.lineTo(640, 140); ctx.stroke();
    ctx.setLineDash([]);

    // Dibujar oscilograma de la ráfaga
    ctx.strokeStyle = '#00ff9d';
    ctx.lineWidth = 1.6;
    ctx.shadowColor = '#00ff9d';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    const step = Math.max(1, Math.floor(samples.length / 640));
    for (let x = 0; x < 640; x++) {
      const idx = x * step;
      const s = samples[idx] || 0;
      const y = 140 - s * 115;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Encabezado del gráfico
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('OSCILOGRAMA CAPTURADO (2.0s WAV) - PROCESAMIENTO WEB AUDIO API', 14, 22);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px monospace';
    ctx.fillText(`Pico: ${peakDb} dBFS  |  RMS: ${rmsDb} dBFS  |  Crest: ${crestFactor} dB`, 14, 265);

    const imageBase64 = offCanvas.toDataURL('image/png');

    displayLibrosaResults({
      image_base64: imageBase64,
      fundamental_note: fundamentalNote,
      fundamental_hz: fundamentalHz,
      thd_percent: thdPct,
      crest_factor: `${crestFactor} dB`,
      peak_db: `${peakDb} dB`,
      rms_db: `${rmsDb} dB`,
      insights: insights,
      harmonics: harmonics,
      isClientOnly: true
    });
  }

  function displayLibrosaResults(data) {
    dom.librosaLoading.style.display = 'none';
    dom.librosaContent.style.display = 'block';

    const netlifyNotice = data.isClientOnly ? `
      <div style="background:rgba(56, 189, 248, 0.08); border:1px solid rgba(56, 189, 248, 0.25); border-radius:8px; padding:10px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div>
          <span style="color:#38bdf8; font-weight:600; font-size:0.85rem;">⚡ Reporte en Navegador (Modo Autónomo Netlify)</span>
          <div style="font-size:0.75rem; color:#94a3b8; margin-top:3px;">
            Métricas de dinámica, armónicos y oscilograma procesados con Web Audio API. Para habilitar el espectrograma STFT de Librosa con Python, enlaza un backend en <code>netlify.toml</code>.
          </div>
        </div>
      </div>
    ` : '';

    let harmonicsHtml = '';
    if (data.harmonics && data.harmonics.length > 0) {
      harmonicsHtml = `
        <div style="background:#141923; padding:12px; border-radius:8px; border:1px solid #273142;">
          <h4 style="color:#f59e0b; margin-bottom:8px; font-size:0.85rem;">Sobretonos Armónicos Detectados:</h4>
          <table style="width:100%; font-family:monospace; font-size:0.8rem; border-collapse:collapse;">
            <thead>
              <tr style="color:#94a3b8; border-bottom:1px solid #273142;">
                <th style="text-align:left; padding:4px;">Armónico</th>
                <th style="text-align:right; padding:4px;">Frecuencia</th>
                <th style="text-align:right; padding:4px;">Nivel Rel.</th>
              </tr>
            </thead>
            <tbody>
              ${data.harmonics.map(h => `
                <tr style="border-bottom:1px solid #1a2230;">
                  <td style="padding:4px; color:#38bdf8;">${h.harmonic}</td>
                  <td style="padding:4px; text-align:right;">${h.freq}</td>
                  <td style="padding:4px; text-align:right; color:#22c55e;">${h.relative_db}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    dom.librosaContent.innerHTML = `
      ${netlifyNotice}
      <div class="librosa-report-grid">
        <div style="text-align:center;">
          <img src="${data.image_base64}" alt="Librosa Analysis" style="max-width:100%; border-radius:8px; border:1px solid #273142; box-shadow:0 8px 24px rgba(0,0,0,0.6);" />
        </div>
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div style="background:#141923; padding:14px; border-radius:8px; border:1px solid #273142;">
            <h4 style="color:#38bdf8; margin-bottom:10px; font-size:0.9rem;">Métricas de Señal del Bajo</h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-family:monospace; font-size:0.85rem;">
              <div>Fundamental: <strong style="color:#00ff9d;">${data.fundamental_note} (${data.fundamental_hz})</strong></div>
              <div>THD Estimada: <strong style="color:#f59e0b;">${data.thd_percent}</strong></div>
              <div>Factor de Cresta: <strong style="color:#38bdf8;">${data.crest_factor}</strong></div>
              <div>Pico / RMS: <strong>${data.peak_db} / ${data.rms_db}</strong></div>
            </div>
          </div>

          <div style="background:#141923; padding:14px; border-radius:8px; border:1px solid #273142;">
            <h4 style="color:#00ff9d; margin-bottom:10px; font-size:0.9rem;">Diagnóstico del Pedal Análogo</h4>
            <div style="font-size:0.85rem; line-height:1.5; color:#cbd5e1; display:flex; flex-direction:column; gap:8px;">
              ${data.insights.map(item => `<div>${item}</div>`).join('')}
            </div>
          </div>

          ${harmonicsHtml}
        </div>
      </div>
    `;
  }

  // --- Codificador simple de WAV (PCM 16-bit Mono) ---
  function encodeWAV(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // 16 bits
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([view], { type: 'audio/wav' });
  }

})();

/* Utilidades de captura: pantallazos, grabación de pantalla+audio y de cámara.
   Requiere ejecutarse en localhost o https (APIs getDisplayMedia / getUserMedia). */

// El micrófono capturado en crudo por getUserMedia suele grabarse muy bajo
// (el navegador no aplica refuerzo por defecto). Esto mezcla todas las
// pistas de audio de entrada en una sola, subiendo el volumen con un
// GainNode y usando un compresor para que los picos no se distorsionen.
// Devuelve la pista de audio ya procesada y el AudioContext (hay que
// cerrarlo al terminar para no dejarlo colgado).
function mezclarConGanancia(audioTracks, gananciaDb = 12) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const destino = ctx.createMediaStreamDestination();
  const compresor = ctx.createDynamicsCompressor();
  compresor.connect(destino);
  audioTracks.forEach((track) => {
    const fuente = ctx.createMediaStreamSource(new MediaStream([track]));
    const ganancia = ctx.createGain();
    ganancia.gain.value = Math.pow(10, gananciaDb / 20);
    fuente.connect(ganancia).connect(compresor);
  });
  return { track: destino.stream.getAudioTracks()[0], audioContext: ctx };
}

function pickMime() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

async function grabScreenshot() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('Este navegador no soporta compartir pantalla.');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  const track = stream.getVideoTracks()[0];
  const video = document.createElement('video');
  video.srcObject = stream;
  await video.play();
  await new Promise(r => setTimeout(r, 250));
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  track.stop();
  stream.getTracks().forEach(t => t.stop());
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

class MediaCapture {
  constructor() {
    this.recorder = null;
    this.chunks = [];
    this.stream = null;
    this.onStop = null;
  }

  async start(kind, opts) {
    opts = opts || {};
    if (kind === 'pantalla') {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        // Una grabación de pantalla es mayormente interfaz estática: no hace
        // falta más de ~15fps para que se lea perfecto y pesa mucho menos.
        video: { frameRate: { ideal: 15, max: 20 } },
        audio: opts.audioSistema !== false
      });
      let audioTracks = [...displayStream.getAudioTracks()];
      if (opts.mic) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioTracks.push(...micStream.getAudioTracks());
          this._micStream = micStream;
        } catch (e) {
          console.warn('No se pudo capturar el micrófono, se graba solo pantalla', e);
        }
      }
      let stream;
      if (audioTracks.length) {
        // Varias pistas de audio sueltas en un mismo MediaStream no se mezclan
        // de forma confiable entre navegadores -MediaRecorder suele quedarse
        // solo con la primera-, así que se combinan explícitamente acá.
        const { track: mezclada, audioContext } = mezclarConGanancia(audioTracks);
        this._audioContext = audioContext;
        this._inputAudioTracks = audioTracks;
        stream = new MediaStream([...displayStream.getVideoTracks(), mezclada]);
      } else {
        stream = displayStream;
      }
      this.stream = stream;
      // Ni el micrófono ni el audio del sistema se capturaron: sin este aviso
      // el video queda mudo y nadie se entera hasta reproducirlo.
      if (typeof toast === 'function' && stream.getAudioTracks().length === 0) {
        toast('Grabando sin audio: revisá el permiso de micrófono o marcá "Compartir audio" al elegir qué compartir', true);
      }
    } else if (kind === 'camara') {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: { frameRate: { ideal: 24 } }, audio: true });
      const audioTracks = camStream.getAudioTracks();
      if (audioTracks.length) {
        const { track: mezclada, audioContext } = mezclarConGanancia(audioTracks);
        this._audioContext = audioContext;
        this.stream = new MediaStream([...camStream.getVideoTracks(), mezclada]);
        this._micStream = camStream;
      } else {
        this.stream = camStream;
      }
    } else {
      throw new Error('Tipo de captura desconocido');
    }

    this.chunks = [];
    const mime = pickMime();
    // Sin este límite, Chrome graba a la máxima calidad posible (varios Mbps),
    // muy por encima de lo que necesita un video de capacitación con texto e
    // interfaz. Bajarlo reduce el tamaño del archivo sin que se note al ver el video.
    const videoBitsPerSecond = kind === 'pantalla' ? 2_000_000 : 1_500_000;
    this.recorder = new MediaRecorder(this.stream, { videoBitsPerSecond, ...(mime ? { mimeType: mime } : {}) });
    this.recorder.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.recorder.start(500);

    this.stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (this.recorder && this.recorder.state !== 'inactive') this.stop();
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.recorder) return resolve(null);
      this.recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.recorder.mimeType || 'video/webm' });
        this._cleanupTracks();
        resolve(blob);
      };
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      else {
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        this._cleanupTracks();
        resolve(blob);
      }
    });
  }

  pause() {
    if (this.recorder && this.recorder.state === 'recording') this.recorder.pause();
  }

  resume() {
    if (this.recorder && this.recorder.state === 'paused') this.recorder.resume();
  }

  get isPaused() {
    return !!this.recorder && this.recorder.state === 'paused';
  }

  _cleanupTracks() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this._micStream) this._micStream.getTracks().forEach(t => t.stop());
    if (this._inputAudioTracks) this._inputAudioTracks.forEach(t => t.stop());
    if (this._audioContext) { this._audioContext.close(); this._audioContext = null; }
  }
}

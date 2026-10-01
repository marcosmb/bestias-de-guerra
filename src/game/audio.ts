// Sistema de audio centralizado usando Web Audio API
// No requiere archivos externos - sintetiza sonidos proceduralmente

export type SoundType = 
  | 'turn-start'
  | 'play-card'
  | 'place-trap'
  | 'activate-trap'
  | 'activate-magic'
  | 'attack'
  | 'damage'
  | 'destroy'
  | 'end-turn'
  | 'victory'
  | 'defeat'
  | 'draw';

interface AudioPreferences {
  enabled: boolean;
  volume: number;
}

const STORAGE_KEY = 'bestias-guerra-audio';

let audioContext: AudioContext | null = null;
let preferences: AudioPreferences = { enabled: true, volume: 0.5 };

// Cargar preferencias del localStorage
function loadPreferences(): AudioPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignorar errores de localStorage
  }
  return { enabled: true, volume: 0.5 };
}

// Guardar preferencias en localStorage
function savePreferences(prefs: AudioPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignorar errores de localStorage
  }
}

// Inicializar o obtener el AudioContext
function getAudioContext(): AudioContext | null {
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  // Reanudar si está suspendido (política de autoplay)
  if (audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
  return audioContext;
}

// Generar un tono simple
function playTone(
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volumeMultiplier: number = 1
): void {
  if (!preferences.enabled) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    const volume = preferences.volume * volumeMultiplier * 0.3;
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch {
    // Ignorar errores de audio
  }
}

// Generar un sonido de ruido (para impactos)
function playNoise(duration: number, volumeMultiplier: number = 1): void {
  if (!preferences.enabled) return;
  
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
    }
    
    const source = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    
    source.buffer = buffer;
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    const volume = preferences.volume * volumeMultiplier * 0.2;
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    
    source.start(ctx.currentTime);
  } catch {
    // Ignorar errores de audio
  }
}

// Definir sonidos para cada acción
const soundMap: Record<SoundType, () => void> = {
  'turn-start': () => {
    playTone(440, 0.1, 'sine', 0.8);
    setTimeout(() => playTone(660, 0.1, 'sine', 0.6), 100);
  },
  'play-card': () => {
    playTone(330, 0.08, 'triangle', 0.7);
  },
  'place-trap': () => {
    playTone(220, 0.12, 'square', 0.5);
  },
  'activate-trap': () => {
    playTone(180, 0.15, 'sawtooth', 0.6);
    setTimeout(() => playTone(120, 0.1, 'sawtooth', 0.4), 80);
  },
  'activate-magic': () => {
    playTone(520, 0.1, 'sine', 0.7);
    setTimeout(() => playTone(780, 0.12, 'sine', 0.5), 60);
  },
  'attack': () => {
    playNoise(0.15, 0.8);
    playTone(150, 0.2, 'sawtooth', 0.5);
  },
  'damage': () => {
    playTone(100, 0.2, 'square', 0.6);
  },
  'destroy': () => {
    playNoise(0.25, 1);
    playTone(80, 0.3, 'sawtooth', 0.5);
  },
  'end-turn': () => {
    playTone(392, 0.08, 'sine', 0.6);
  },
  'victory': () => {
    playTone(523, 0.15, 'sine', 0.7);
    setTimeout(() => playTone(659, 0.15, 'sine', 0.7), 150);
    setTimeout(() => playTone(784, 0.2, 'sine', 0.7), 300);
  },
  'defeat': () => {
    playTone(392, 0.2, 'sine', 0.6);
    setTimeout(() => playTone(330, 0.2, 'sine', 0.6), 200);
    setTimeout(() => playTone(262, 0.3, 'sine', 0.6), 400);
  },
  'draw': () => {
    playTone(440, 0.05, 'sine', 0.4);
  },
};

// Función principal para reproducir un sonido
export function playSound(type: SoundType): void {
  const soundFn = soundMap[type];
  if (soundFn) {
    soundFn();
  }
}

// Obtener preferencias actuales
export function getAudioPreferences(): AudioPreferences {
  return { ...preferences };
}

// Actualizar preferencias
export function setAudioPreferences(prefs: Partial<AudioPreferences>): void {
  preferences = { ...preferences, ...prefs };
  savePreferences(preferences);
}

// Activar/desactivar sonido
export function setSoundEnabled(enabled: boolean): void {
  preferences.enabled = enabled;
  savePreferences(preferences);
}

// Establecer volumen (0-1)
export function setVolume(volume: number): void {
  preferences.volume = Math.max(0, Math.min(1, volume));
  savePreferences(preferences);
}

// Inicializar preferencias al cargar
export function initAudio(): void {
  preferences = loadPreferences();
}

// Feedback táctil (vibración)
export function vibrate(pattern: number | number[] = 50): void {
  try {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignorar errores de vibración
  }
}

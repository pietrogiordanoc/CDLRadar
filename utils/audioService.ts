// Singleton Audio Service to manage a single AudioContext

let audioCtx: AudioContext | null = null;
let isInitializing = false;
let alertVolume = 0.5;

const initializeAudioContext = (): AudioContext | null => {
  if (isInitializing || typeof window === 'undefined') return null;
  if (!audioCtx) {
    try {
      isInitializing = true;
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.error("Web Audio API is not supported in this browser.", e);
      audioCtx = null;
    } finally {
      isInitializing = false;
    }
  }
  return audioCtx;
};

// Function to play sounds, ensuring context is initialized
const playSound = async (type: 'entry' | 'exit') => {
  // Attempt to initialize if not already
  const ctx = initializeAudioContext();
  if (!ctx) {
    console.warn('[AudioService] No se pudo inicializar AudioContext');
    return;
  }
  
  // If context is suspended, it needs a user gesture to resume
  if (ctx.state === 'suspended') {
    console.log('[AudioService] AudioContext suspendido, intentando reanudar...');
    try {
      await ctx.resume();
      console.log('[AudioService] AudioContext reanudado exitosamente');
    } catch (error) {
      console.error('[AudioService] No se pudo reanudar AudioContext:', error);
      return;
    }
  }

  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.type = 'sine';
  if (type === 'entry') {
    oscillator.frequency.setValueAtTime(440, ctx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(880, ctx.currentTime + 0.2);
  } else {
    oscillator.frequency.setValueAtTime(660, ctx.currentTime);
    oscillator.frequency.linearRampToValueAtTime(330, ctx.currentTime + 0.3);
  }

  gainNode.gain.setValueAtTime(alertVolume * 0.15, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + 0.5);
};

const setGlobalVolume = (volume: number) => {
  alertVolume = Math.max(0, Math.min(1, volume));
};

// Get audio context (for checking state)
const getContext = (): AudioContext | null => {
  return audioCtx;
};

// Expose public methods
export const audioService = {
  initialize: initializeAudioContext,
  play: playSound,
  setVolume: setGlobalVolume,
  getContext
};

// Short tones made with the Web Audio API (no sound files). Audio may be
// blocked until the user has touched the screen once; the visual alert still
// shows then.

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    ctx ??= new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(at: number, freq: number, length: number, volume: number) {
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = "sine";
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.001, a.currentTime + at);
  g.gain.exponentialRampToValueAtTime(volume, a.currentTime + at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + at + length);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + at);
  o.stop(a.currentTime + at + length);
}

/** One short beep (KDS: a new KOT). */
export function beep() {
  tone(0, 880, 0.25, 0.2);
}

/** Two rising beeps: something needs staff attention (QR order, food ready, bill request). */
export function chime() {
  tone(0, 880, 0.3, 0.3);
  tone(0.4, 1175, 0.35, 0.3);
}

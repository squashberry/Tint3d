// Original synthesized sound design for the match intro (no samples, no licences).
// Everything goes through the game's existing AudioContext and respects its sound toggle.
export function createCinemaAudio({ getContext, isOn }) {
  let noise = null;
  const ctx = () => {
    if (!isOn()) return null;
    try { return getContext(); } catch { return null; }
  };
  function noiseBuffer(c) {
    if (noise && noise.sampleRate === c.sampleRate) return noise;
    noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }
  function tone(c, type, f0, f1, dur, gain, delay = 0) {
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function sweep(c, f0, f1, dur, gain, q = 2, delay = 0) {
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(c);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
  return {
    lightsOn() { const c = ctx(); if (!c) return; tone(c, 'sine', 58, 38, 0.9, 0.16); sweep(c, 180, 4200, 0.9, 0.05, 1.2); tone(c, 'square', 90, 90, 0.07, 0.02, 0.28); tone(c, 'square', 140, 140, 0.07, 0.02, 0.62); },
    whoosh() { const c = ctx(); if (!c) return; sweep(c, 400, 2600, 0.5, 0.05, 1.4); },
    teamSting(base) { const c = ctx(); if (!c) return; [1, 1.26, 1.5].forEach((m, i) => tone(c, 'sawtooth', base * m, base * m * 1.01, 0.22, 0.03, i * 0.07)); sweep(c, 800, 3000, 0.3, 0.03, 3); },
    ready() { const c = ctx(); if (!c) return; tone(c, 'square', 330, 330, 0.09, 0.025); tone(c, 'square', 330, 330, 0.09, 0.025, 0.13); },
    collision() { const c = ctx(); if (!c) return; tone(c, 'sine', 150, 32, 0.7, 0.3); sweep(c, 300, 1200, 0.5, 0.12, 0.9); sweep(c, 1800, 300, 0.45, 0.09, 6); tone(c, 'triangle', 520, 140, 0.35, 0.05, 0.04); },
    tick(n) { const c = ctx(); if (!c) return; tone(c, 'sine', 560 + n * 90, 560 + n * 90, 0.12, 0.07); },
    go() { const c = ctx(); if (!c) return; [1, 1.25, 1.5, 2].forEach((m) => tone(c, 'sawtooth', 330 * m, 330 * m * 1.02, 0.5, 0.045)); sweep(c, 300, 5000, 0.4, 0.08, 1.2); tone(c, 'sine', 110, 55, 0.4, 0.2); }
  };
}

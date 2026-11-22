// Original synthesized sound design for the splash (footsteps, cloth, fuse, throw, rubbery paint
// impact, wobble, drips, digital glitches, logo accent). Plays only when the player has sound on.
export function createSplashAudio({ isOn }) {
  let context = null;
  let noise = null;
  const get = () => {
    if (!isOn()) return null;
    try {
      context ||= new (window.AudioContext || window.webkitAudioContext)();
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context.state === 'running' ? context : null;
    } catch { return null; }
  };
  const noiseBuffer = (c) => {
    if (noise) return noise;
    noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  };
  const tone = (c, type, f0, f1, dur, gain, delay = 0) => {
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.03);
  };
  const burst = (c, f0, f1, dur, gain, q = 1.2, delay = 0, type = 'bandpass') => {
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = noiseBuffer(c);
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.03, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t);
    s.stop(t + dur + 0.05);
  };
  return {
    unlock() { get(); },
    get enabled() { return isOn(); },
    step(i) { const c = get(); if (!c) return; burst(c, 260 + (i % 2) * 70, 90, 0.11, 0.09, 1.1, 0, 'lowpass'); tone(c, 'sine', 90, 50, 0.1, 0.05); },
    cloth() { const c = get(); if (!c) return; burst(c, 2400, 900, 0.22, 0.025, 0.7); },
    activate() { const c = get(); if (!c) return; tone(c, 'square', 520, 780, 0.09, 0.04); tone(c, 'square', 780, 1040, 0.09, 0.04, 0.1); burst(c, 3000, 5200, 0.35, 0.04, 2, 0.05); },
    fuse() { const c = get(); if (!c) return; burst(c, 1800, 6500, 0.9, 0.035, 4); tone(c, 'sawtooth', 220, 880, 0.9, 0.018); },
    throwWhoosh() { const c = get(); if (!c) return; burst(c, 500, 3600, 0.28, 0.09, 1.6); tone(c, 'sine', 180, 520, 0.22, 0.04); },
    flight() { const c = get(); if (!c) return; burst(c, 700, 5200, 0.5, 0.06, 2.4); tone(c, 'sawtooth', 300, 1400, 0.5, 0.02); },
    impact() { const c = get(); if (!c) return; tone(c, 'sine', 170, 30, 0.8, 0.34); burst(c, 260, 1100, 0.6, 0.15, 0.8); burst(c, 2400, 260, 0.55, 0.1, 6, 0.02); tone(c, 'triangle', 600, 120, 0.4, 0.06, 0.03); },
    wobble() { const c = get(); if (!c) return; tone(c, 'sine', 140, 260, 0.14, 0.07); tone(c, 'sine', 260, 120, 0.2, 0.06, 0.12); },
    drip() { const c = get(); if (!c) return; tone(c, 'sine', 900 + Math.random() * 500, 300, 0.1, 0.05); },
    glitch() { const c = get(); if (!c) return; tone(c, 'square', 1200 + Math.random() * 1800, 300, 0.05, 0.018); burst(c, 5200, 2000, 0.06, 0.02, 2); },
    logo() { const c = get(); if (!c) return; [1, 1.25, 1.5, 2].forEach((m, i) => tone(c, 'sawtooth', 261 * m, 261 * m * 1.005, 0.5, 0.035, i * 0.06)); tone(c, 'sine', 130, 65, 0.5, 0.12); burst(c, 400, 4500, 0.4, 0.04, 1.2); },
    bounce() { const c = get(); if (!c) return; tone(c, 'sine', 380, 140, 0.16, 0.08); }
  };
}

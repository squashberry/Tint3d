// Entry point: shows the cinematic splash first, then loads the real game underneath it.
// The splash is optional: if it fails for any reason the game still initialises normally.
import './splash/splash.css';
import { loadTracker } from './boot/loadTracker.js';

// Weak hardware gets the CSS-only splash (the 3D cinematic would run at about 1 fps there).
// Override with ?splash=full or ?splash=lite.
function isWeakDevice() {
  if (/splash=full/.test(location.search)) return false;
  if (/splash=lite/.test(location.search)) return true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 4;
  let gpu = '';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
    gpu = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    if (!gl) return true;
  } catch { return true; }
  let score = 0;
  if (/SwiftShader|llvmpipe|Basic Render|Mali-4|Mali-T[0-6]|Adreno \(TM\) [2-4]\d\d|PowerVR|HD Graphics [2-5]\d{3}|GMA/i.test(gpu)) score += 2;
  else if (/Intel/i.test(gpu) && !/Iris|Xe|Arc|UHD Graphics 6/i.test(gpu)) score += 1;
  if (cores <= 2) score += 2; else if (cores <= 4) score += 1;
  if (memory <= 2) score += 2; else if (memory <= 4) score += 1;
  if (matchMedia('(pointer: coarse)').matches) score += 0.5;
  return score >= 2;
}

async function boot() {
  let splash = null;
  try {
    const weak = isWeakDevice();
    const root = document.getElementById('splash');
    if (weak) {
      const { LiteSplash } = await import('./splash/LiteSplash.js');
      splash = new LiteSplash({ root, tracker: loadTracker });
    } else {
      const { Splash } = await import('./splash/Splash.js');
      splash = new Splash({ root, tracker: loadTracker });
    }
    splash.start();
  } catch (error) {
    console.warn('Tint3d splash unavailable, loading the game directly.', error);
    document.getElementById('splash')?.remove();
    document.body.classList.remove('splash-on');
    splash = null;
  }
  // Let the splash paint its first frames before the (synchronous, heavy) game module evaluates.
  await new Promise((resolve) => setTimeout(resolve, splash ? 700 : 0));
  loadTracker.setStage('boot');
  try {
    await import('./main.js');
  } catch (error) {
    console.error('Tint3d failed to load', error);
    splash?.fail?.(error);
    throw error;
  }
  loadTracker.setStage('main');
  window.dispatchEvent(new Event('tint3d:main-loaded'));
  // Safety net: never trap the player behind the splash.
  setTimeout(() => loadTracker.force(), 30000);
}

boot();

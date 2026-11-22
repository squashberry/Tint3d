// Entry point: shows the cinematic splash first, then loads the real game underneath it.
// The splash is optional: if it fails for any reason the game still initialises normally.
import './splash/splash.css';
import { loadTracker } from './boot/loadTracker.js';

async function boot() {
  let splash = null;
  try {
    const { Splash } = await import('./splash/Splash.js');
    splash = new Splash({ root: document.getElementById('splash'), tracker: loadTracker });
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

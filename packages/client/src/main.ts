import { Engine, Scene } from '@babylonjs/core';
import { Assets } from './game/assets';
import { Game } from './game/game';
import './styles.css';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLElement;

async function boot(): Promise<void> {
  const engine = new Engine(canvas, true, { stencil: false, powerPreference: 'high-performance' }, true);
  // Very dense displays gain little from full resolution and lose a lot of frame rate.
  engine.setHardwareScalingLevel(Math.max(1, window.devicePixelRatio / 1.5) / window.devicePixelRatio);
  const scene = new Scene(engine);
  scene.skipPointerMovePicking = true;
  scene.autoClear = true;

  const assets = new Assets(scene);
  const game = new Game(scene, assets, canvas, ui);
  (window as unknown as { __game: Game }).__game = game;

  game.menus.loading(0, 'Si accendono le torce…');
  engine.runRenderLoop(() => game.frame());
  window.addEventListener('resize', () => engine.resize());

  try {
    await assets.load((done, total) => game.menus.loading(done / total, `Carico la Compagnia e i suoi nemici… ${done}/${total}`));
  } catch (err) {
    console.error(err);
    game.menus.loading(1, 'Non riesco a caricare i modelli. Ricarica la pagina.');
    return;
  }
  game.menus.title();
}

void boot();

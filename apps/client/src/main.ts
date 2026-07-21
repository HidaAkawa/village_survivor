import Phaser from 'phaser';

import { GameScene } from './scenes/GameScene.js';
import { LocalSession, type VillageSurvivorDebug } from './session/LocalSession.js';
import { AudioFeedback } from './ui/AudioFeedback.js';
import { Hud } from './ui/Hud.js';
import './styles.css';

declare global {
  interface Window {
    __VILLAGE_SURVIVOR_DEBUG__?: VillageSurvivorDebug;
  }
}

const gameElement = document.querySelector<HTMLElement>('#game');
const hudElement = document.querySelector<HTMLElement>('#hud');
if (gameElement === null || hudElement === null) {
  throw new Error('La page ne contient pas les points de montage attendus.');
}

const parameters = new URLSearchParams(location.search);
const seed = parameters.get('seed') ?? crypto.randomUUID().slice(0, 8);
const session = new LocalSession({ seed });
const scene = new GameScene(session);
const hud = new Hud(hudElement, (upgradeId) => scene.selectUpgrade(upgradeId));
const audio = new AudioFeedback();

let latestState: ReturnType<VillageSurvivorDebug['getState']> | undefined;
session.subscribe((state) => {
  latestState = state;
  hud.render(state);
  audio.consume(state);
});

// `F` ouvre le panneau d'améliorations quand le joueur le décide ; `1`, `2` et `3`
// choisissent sans quitter le clavier une fois qu'il est ouvert.
window.addEventListener('keydown', (event) => {
  if (event.repeat || latestState === undefined) {
    return;
  }
  if (event.code === 'KeyF') {
    if (latestState.upgradeChoices.length > 0) {
      hud.toggleUpgradePanel();
      hud.render(latestState);
    }
    return;
  }
  if (!hud.isUpgradePanelOpen()) {
    return;
  }
  const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
  const choice = index < 0 ? undefined : latestState.upgradeChoices[index];
  if (choice !== undefined) {
    scene.selectUpgrade(choice.id);
  }
});

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: gameElement,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: '#111a1d',
  render: {
    antialias: true,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [scene],
});

if (import.meta.env.DEV) {
  window.__VILLAGE_SURVIVOR_DEBUG__ = session.debug;
  const metrics = document.createElement('output');
  metrics.className = 'debug-metrics';
  metrics.setAttribute('aria-label', 'Métriques de développement');
  document.body.append(metrics);
  window.setInterval(() => {
    const state = session.debug.getState();
    const sessionMetrics = session.debug.getMetrics();
    metrics.textContent = [
      `FPS ${game.loop.actualFps.toFixed(0)}`,
      `tick ${state.tick}`,
      `sim ${sessionMetrics.lastTickDurationMs.toFixed(2)} ms`,
      `entités ${state.enemies.length + state.resources.filter((resource) => resource.amountRemaining > 0).length + state.defenses.length + 2}`,
      `graine ${state.seed}`,
    ].join(' · ');
  }, 500);
}

void session.start();
window.addEventListener('beforeunload', () => void session.stop(), { once: true });

import type { PublicGameState } from '@village-survivor/protocol';

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function percentage(value: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.max(0, Math.min(100, (value / maximum) * 100));
}

function phaseName(state: PublicGameState): string {
  if (state.phase === 'day') {
    return `Jour ${state.cycle}`;
  }
  if (state.phase === 'night') {
    return `Nuit ${state.cycle}`;
  }
  return 'Activation finale';
}

function cooldownLabel(remainingMs: number): string {
  return remainingMs <= 0 ? 'PRÊT' : `${(remainingMs / 1_000).toFixed(1)} s`;
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character] ?? character);
}

export class Hud {
  private readonly element: HTMLElement;
  private readonly onUpgrade: (upgradeId: string) => void;
  private upgradeSignature = '';
  private terminalStatus: PublicGameState['status'] | undefined;

  public constructor(element: HTMLElement, onUpgrade: (upgradeId: string) => void) {
    this.element = element;
    this.onUpgrade = onUpgrade;
  }

  public render(state: PublicGameState): void {
    const upgradeSignature = state.upgradeChoices.map((choice) => choice.id).join('|');
    const isTerminal = state.status === 'victory' || state.status === 'defeat';
    if (
      isTerminal &&
      state.status === this.terminalStatus &&
      this.element.querySelector('[data-testid="result-panel"]') !== null
    ) {
      return;
    }
    if (
      !isTerminal &&
      upgradeSignature !== '' &&
      upgradeSignature === this.upgradeSignature &&
      this.element.querySelector('[data-testid="upgrade-panel"]') !== null
    ) {
      return;
    }
    this.upgradeSignature = upgradeSignature;
    this.terminalStatus = isTerminal ? state.status : undefined;
    const resultPanel =
      state.status === 'victory' || state.status === 'defeat'
        ? `<section class="result result--${state.status}" data-testid="result-panel">
            <p class="eyebrow">${state.status === 'victory' ? 'MISSION ACCOMPLIE' : 'LA NUIT L’EMPORTE'}</p>
            <h1>${state.status === 'victory' ? 'Village sauvé' : 'Partie terminée'}</h1>
            <p>${escapeHtml(state.resultReason ?? '')}</p>
            <button type="button" id="restart-game">Recommencer</button>
          </section>`
        : '';
    const upgradePanel =
      state.status === 'running' && state.upgradeChoices.length > 0
        ? `<section class="upgrades" data-testid="upgrade-panel">
            <p class="eyebrow">NIVEAU ${state.player.level}</p>
            <h2>Choisissez une amélioration</h2>
            <p>Le monde continue pendant votre choix.</p>
            <div class="upgrade-grid">
              ${state.upgradeChoices
                .map(
                  (
                    upgrade,
                  ) => `<button type="button" class="upgrade-card" data-upgrade-id="${escapeHtml(upgrade.id)}">
                    <span>${upgrade.discipline === 'sword' ? 'ÉPÉE' : 'BARRIÈRE'}</span>
                    <strong>${escapeHtml(upgrade.name)}</strong>
                    <small>${escapeHtml(upgrade.description)}</small>
                  </button>`,
                )
                .join('')}
            </div>
          </section>`
        : '';
    const hint = escapeHtml(
      state.interactionHint ?? 'Explorez les alentours et surveillez la minimap.',
    );
    const playerHp = percentage(state.player.hp, state.player.maxHp);
    const villageHp = percentage(state.village.hp, state.village.maxHp);
    const experience = percentage(state.player.experience, state.player.experienceToNext);
    const operationalDefenses = state.defenses.filter((defense) => defense.built);
    const construction = state.defenses.find((defense) => !defense.built);
    const insideVillage =
      Math.hypot(
        state.player.position.x - state.village.position.x,
        state.player.position.y - state.village.position.y,
      ) <= state.village.areaRadius;

    this.element.innerHTML = `
      <header class="topbar">
        <div class="brand"><span>VS</span><strong>Village Survivor</strong><small>M1 · ${escapeHtml(state.seed)}</small></div>
        <div class="phase phase--${state.phase}" data-testid="phase">
          <span>${phaseName(state)}</span><strong>${formatTime(state.phaseRemainingMs)}</strong>
        </div>
      </header>
      <aside class="status-panel">
        <div class="stat-heading"><span>Personnage</span><strong>Niv. ${state.player.level}</strong></div>
        <div class="bar"><i style="width:${playerHp}%"></i><span>${Math.ceil(state.player.hp)} / ${state.player.maxHp} PV</span></div>
        <div class="bar bar--ward"><i style="width:${percentage(state.player.ward, state.player.maxWard)}%"></i><span>${Math.ceil(state.player.ward)} garde</span></div>
        <div class="bar bar--xp"><i style="width:${experience}%"></i><span>${Math.floor(state.player.experience)} / ${state.player.experienceToNext} XP</span></div>
        <div class="inventory">
          <span>Transport <strong data-testid="carried-wood">${state.player.carriedWood}/${state.player.carryCapacity}</strong></span>
          <span>Stock <strong data-testid="stored-wood">${state.player.storedWood}</strong></span>
        </div>
      </aside>
      <aside class="village-panel">
        <div class="stat-heading"><span>Cœur du village</span><strong>Niv. ${state.village.heartLevel}</strong></div>
        <div class="bar bar--village"><i style="width:${villageHp}%"></i><span>${Math.ceil(state.village.hp)} / ${state.village.maxHp} PV</span></div>
        <p class="location location--${insideVillage ? 'inside' : 'outside'}" data-testid="location"><i></i>${insideVillage ? 'Dans le village' : 'À l’extérieur du village'}</p>
        <p>Balistes : <strong>${operationalDefenses.length} opérationnelle${operationalDefenses.length > 1 ? 's' : ''}${construction === undefined ? '' : ` · chantier ${(construction.buildRemainingMs / 1_000).toFixed(1)} s`}</strong></p>
      </aside>
      <section class="objective" data-testid="objective"><span>OBJECTIF</span><strong>${escapeHtml(state.objective)}</strong></section>
      <section class="interaction" data-testid="interaction-hint">${hint}</section>
      <section class="abilities">
        <div><kbd>Espace</kbd><span>Fente</span><strong>${cooldownLabel(state.player.sword.cooldownRemainingMs)}</strong></div>
        <div class="ability--barrier"><kbd>Maj</kbd><span>Barrière</span><strong>${cooldownLabel(state.player.barrier.cooldownRemainingMs)}</strong></div>
      </section>
      <footer class="controls"><span><kbd>ZQSD</kbd> / flèches · déplacement</span><span><kbd>E</kbd> · interagir</span><span><kbd>B</kbd> · baliste à votre position</span><span>Souris · viser</span></footer>
      ${upgradePanel}
      ${resultPanel}
    `;

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-upgrade-id]')) {
      button.addEventListener('click', () => {
        const upgradeId = button.dataset.upgradeId;
        if (upgradeId !== undefined) {
          this.onUpgrade(upgradeId);
        }
      });
    }
    this.element.querySelector('#restart-game')?.addEventListener('click', () => location.reload());
  }
}

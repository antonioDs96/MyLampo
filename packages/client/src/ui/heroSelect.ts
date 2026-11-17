import { HEROES, HERO_IDS, MAX_PLAYERS, type HeroId, type LobbyState } from '@malampu/shared';
import { h } from './dom';

export interface HeroSelectActions {
  /** Claim a hero (the server refuses one that someone else holds). */
  pick(hero: HeroId): void;
  /** "Conferma Pronto", or taking it back. */
  ready(on: boolean): void;
  leave(): void;
  sound(id: 'ui' | 'uiBack' | 'deny'): void;
}

/** Colour of each lobby slot: the same one the radar and the pointers use. */
export const SLOT_COLORS = ['#f2c14e', '#58b4ff', '#5fe08a', '#ff6b5e', '#c084fc', '#fb923c', '#2dd4bf', '#f472b6', '#e5e7eb'];

/**
 * The Hero Selection screen: the 3D model fills the screen (drawn by the hero stage)
 * and the only text is the hero's Name and Class.
 */
export class HeroSelect {
  visible = false;
  /** The hero on the pedestal. */
  shown: HeroId = HERO_IDS[0]!;
  private readonly root = h('div', { class: 'hero-select hidden' });
  private readonly nameEl = h('h1');
  private readonly classEl = h('div', { class: 'hs-class' });
  private readonly partyEl = h('div', { class: 'hs-party' });
  private readonly roomEl = h('div', { class: 'hs-room' });
  private readonly statusEl = h('div', { class: 'hs-status' });
  private readonly confirmBtn = h('button', { class: 'btn primary hs-confirm' });
  private readonly cancelBtn = h('button', { class: 'btn ghost', text: 'Annulla' });
  private lobby: LobbyState | null = null;
  private myId = '';
  /** Hero asked for and not yet granted: "ready" follows as soon as the server agrees. */
  private wanted: HeroId | '' = '';
  private key = '';

  constructor(
    parent: HTMLElement,
    private readonly actions: HeroSelectActions,
  ) {
    this.confirmBtn.addEventListener('click', () => this.confirm());
    this.cancelBtn.addEventListener('click', () => {
      this.actions.sound('uiBack');
      this.actions.ready(false);
    });
    this.root.append(
      h('div', { class: 'hs-top' }, h('button', { class: 'btn ghost small', text: 'Esci', onclick: () => this.actions.leave() }), this.partyEl, this.roomEl),
      h('button', { class: 'hs-arrow prev', text: '‹', attrs: { 'aria-label': 'Eroe precedente' }, onclick: () => this.step(-1) }),
      h('button', { class: 'hs-arrow next', text: '›', attrs: { 'aria-label': 'Eroe successivo' }, onclick: () => this.step(1) }),
      h('div', { class: 'hs-plate' }, this.nameEl, this.classEl, this.statusEl, h('div', { class: 'hs-actions' }, this.confirmBtn, this.cancelBtn)),
    );
    parent.append(this.root);
  }

  private get me() {
    return this.lobby?.players.find((p) => p.id === this.myId);
  }

  private ownerOf(hero: HeroId) {
    return this.lobby?.players.find((p) => p.hero === hero && p.id !== this.myId);
  }

  setVisible(on: boolean): void {
    if (on === this.visible) return;
    this.visible = on;
    this.root.classList.toggle('hidden', !on);
    if (on) {
      this.wanted = '';
      // Start from the hero already held, or from the first one nobody has taken.
      const mine = this.me?.hero;
      this.shown = mine || HERO_IDS.find((id) => !this.ownerOf(id)) || HERO_IDS[0]!;
      this.key = '';
      this.render();
    }
  }

  setLobby(lobby: LobbyState, myId: string): void {
    this.lobby = lobby;
    this.myId = myId;
    const me = this.me;
    if (this.wanted) {
      if (me?.hero === this.wanted) {
        this.wanted = '';
        if (!me.ready) this.actions.ready(true);
      } else if (this.ownerOf(this.wanted)) {
        this.wanted = '';
      }
    }
    if (this.visible) this.render();
  }

  step(dir: number): void {
    if (this.me?.ready) return;
    const i = HERO_IDS.indexOf(this.shown);
    this.shown = HERO_IDS[(i + dir + HERO_IDS.length) % HERO_IDS.length]!;
    this.wanted = '';
    this.actions.sound('ui');
    this.render();
  }

  confirm(): void {
    const me = this.me;
    if (!me || me.ready) return;
    if (this.ownerOf(this.shown)) {
      this.actions.sound('deny');
      return;
    }
    this.actions.sound('ui');
    if (me.hero === this.shown) {
      this.actions.ready(true);
    } else {
      this.wanted = this.shown;
      this.actions.pick(this.shown);
    }
  }

  /** Keyboard: returns true when the key was used. */
  handleKey(code: string): boolean {
    if (!this.visible) return false;
    if (code === 'ArrowLeft' || code === 'KeyA') this.step(-1);
    else if (code === 'ArrowRight' || code === 'KeyD') this.step(1);
    else if (code === 'Enter' || code === 'Space') {
      if (this.me?.ready) return true;
      this.confirm();
    } else return false;
    return true;
  }

  private render(): void {
    const lobby = this.lobby;
    const me = this.me;
    if (!lobby || !me) return;
    const hero = HEROES[this.shown];
    const owner = this.ownerOf(this.shown);
    const readyCount = lobby.players.filter((p) => p.ready).length;
    const key = JSON.stringify([this.shown, owner?.name, me.ready, lobby.phase, lobby.code, lobby.players.map((p) => [p.id, p.name, p.hero, p.ready, p.slot])]);
    if (key === this.key) return;
    this.key = key;

    this.root.style.setProperty('--c', hero.color);
    this.root.classList.toggle('is-ready', me.ready);
    this.nameEl.textContent = hero.name;
    this.classEl.textContent = hero.role;

    const waiting = me.ready && lobby.phase === 'select';
    this.statusEl.textContent = waiting
      ? `In attesa della Compagnia · ${readyCount} di ${lobby.players.length} pronti`
      : owner
        ? `Scelto da ${owner.name}`
        : '';
    this.confirmBtn.textContent = 'Conferma Pronto';
    this.confirmBtn.classList.toggle('disabled', !!owner);
    this.confirmBtn.classList.toggle('hidden', me.ready);
    this.cancelBtn.classList.toggle('hidden', !waiting);

    this.partyEl.replaceChildren(
      ...lobby.players.map((p) =>
        h(
          'span',
          { class: `hs-chip ${p.ready ? 'ready' : ''} ${p.id === this.myId ? 'mine' : ''}`, style: `--c:${SLOT_COLORS[p.slot % SLOT_COLORS.length]}` },
          h('i'),
          p.hero ? `${p.name} · ${HEROES[p.hero].short}` : p.name,
        ),
      ),
    );
    this.roomEl.textContent = lobby.public ? `Taverna ${lobby.code} · ${lobby.players.length}/${MAX_PLAYERS}` : `Stanza ${lobby.code} · ${lobby.players.length}/${MAX_PLAYERS}`;
  }
}

import {
  HEROES,
  HERO_IDS,
  MISSIONS,
  REGIONS,
  missionById,
  type HeroId,
  type LobbyState,
  type RegionDef,
} from '@malampu/shared';
import { h, portrait, svg } from './dom';

export interface MenuActions {
  create(name: string): void;
  join(name: string, code: string): void;
  solo(name: string): void;
  pickHero(id: HeroId): void;
  selectMission(id: string): void;
  startMission(): void;
  retry(): void;
  toHub(): void;
  leave(): void;
  sound(id: 'ui' | 'uiBack' | 'deny'): void;
  /** Called whenever a panel opens or closes. */
  changed(): void;
}

export type Panel = 'none' | 'loading' | 'title' | 'heroes' | 'council' | 'results' | 'help';

const ROADS: [string, string][] = [
  ['malya', 'mur'], ['mur', 'minervin'], ['minervin', 'jugianel'], ['minervin', 'ujian'], ['ujian', 'otranth'],
  ['ujian', 'badiscar'], ['mur', 'sanarica'], ['malya', 'jugianel'], ['malya', 'sanarica'], ['otranth', 'badiscar'],
];

const CONTROLS: [string, string, string][] = [
  ['Movimento', 'W A S D', 'Levetta sinistra'],
  ['Visuale', 'Mouse', 'Levetta destra'],
  ['Attacco leggero (combo)', 'Clic sinistro', 'X / Quadrato'],
  ['Attacco pesante (tieni premuto per caricare)', 'Clic centrale o K', 'Y / Triangolo, RT'],
  ['Schivata', 'Spazio', 'B / Cerchio'],
  ['Parata (premi all’ultimo istante per la parata perfetta)', 'Clic destro, Q o Shift', 'LB'],
  ['Aggancia bersaglio / cambia bersaglio', 'Tab / rotellina', 'R3 / croce direzionale'],
  ['Abilità distintiva', 'E', 'RB'],
  ['Suprema (quando la barra è piena)', 'R', 'LT'],
  ['Esecuzione, rianimare un alleato, tavolo del Consiglio', 'F', 'A / Croce'],
  ['Cambia eroe (solo in taverna)', 'C', '—'],
  ['Aiuto / pausa', 'H o Esc', 'Start'],
  ['Audio sì/no', 'M', '—'],
];

export class Menus {
  panel: Panel = 'none';
  private readonly root: HTMLElement;
  private readonly toastBox = h('div', { class: 'toasts' });
  private lobby: LobbyState | null = null;
  private myId = '';
  private region = 'ujian';
  private titleError = '';
  private busyText = '';
  private name = '';
  private code = '';
  /** Results the player already dismissed (so they do not reopen every lobby update). */
  private canClose = false;

  constructor(parent: HTMLElement, private readonly actions: MenuActions) {
    this.root = h('div', { class: 'menus' });
    parent.append(this.root, this.toastBox);
    try {
      this.name = localStorage.getItem('malampu.name') ?? '';
    } catch {
      this.name = '';
    }
    this.code = (new URLSearchParams(location.search).get('stanza') ?? '').toUpperCase().slice(0, 6);
  }

  get open(): boolean {
    return this.panel !== 'none';
  }

  private show(panel: Panel, ...content: (Node | null)[]): void {
    const was = this.panel;
    this.panel = panel;
    this.root.className = `menus panel-${panel}`;
    this.root.replaceChildren(...content.filter((c): c is Node => !!c));
    if (was !== panel) this.actions.changed();
  }

  close(): void {
    if (this.panel === 'none') return;
    this.show('none');
  }

  toast(text: string): void {
    const el = h('div', { class: 'toast', text });
    this.toastBox.append(el);
    setTimeout(() => el.remove(), 4200);
  }

  setLobby(lobby: LobbyState, myId: string): void {
    this.lobby = lobby;
    this.myId = myId;
    if (this.panel === 'heroes') this.openHeroes(this.canClose);
    else if (this.panel === 'council') this.openCouncil();
    else if (this.panel === 'results') this.openResults();
  }

  // ---------------------------------------------------------------- loading and title

  loading(progress: number, text: string): void {
    if (this.panel !== 'loading') {
      this.show(
        'loading',
        h(
          'div',
          { class: 'loading' },
          h('div', { class: 'logo' }, h('div', { class: 'logo-eclipse' }), h('h1', { text: 'MALAMPU' }), h('h2', { text: "L'Eclissi della Dea Velata" })),
          h('div', { class: 'bar load' }, h('i')),
          h('div', { class: 'load-text' }),
        ),
      );
    }
    (this.root.querySelector('.load i') as HTMLElement).style.transform = `scaleX(${Math.max(0.02, Math.min(1, progress))})`;
    (this.root.querySelector('.load-text') as HTMLElement).textContent = text;
  }

  title(error = ''): void {
    this.titleError = error;
    this.busyText = '';
    this.renderTitle();
  }

  busy(text: string): void {
    this.busyText = text;
    this.renderTitle();
  }

  private renderTitle(): void {
    const name = h('input', { attrs: { type: 'text', maxlength: '18', placeholder: 'Il tuo nome', autocomplete: 'off', spellcheck: 'false' } });
    name.value = this.name;
    const code = h('input', { class: 'code', attrs: { type: 'text', maxlength: '6', placeholder: 'CODICE', autocomplete: 'off', spellcheck: 'false' } });
    code.value = this.code;
    const read = (): string => {
      this.name = name.value.trim();
      this.code = code.value.trim().toUpperCase();
      try {
        localStorage.setItem('malampu.name', this.name);
      } catch {
        // Private browsing: the name simply is not remembered.
      }
      return this.name || 'Viandante';
    };
    const busy = !!this.busyText;
    const join = () => {
      const n = read();
      if (this.code.length < 4) {
        this.titleError = 'Scrivi il codice della stanza che ti hanno passato.';
        this.actions.sound('deny');
        this.renderTitle();
        return;
      }
      this.actions.join(n, this.code);
    };
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join();
    });
    name.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') (this.code ? join : () => this.actions.create(read()))();
    });
    this.show(
      'title',
      h(
        'div',
        { class: 'title' },
        h('div', { class: 'logo' }, h('div', { class: 'logo-eclipse' }), h('h1', { text: 'MALAMPU' }), h('h2', { text: "L'Eclissi della Dea Velata" })),
        h('p', {
          class: 'tagline',
          text: "L'Ordine del Sole Nero vuole spegnere ogni voce del Salento. Otto reietti, una taverna e una mappa: la Compagnia combatte insieme, mai l'uno contro l'altro.",
        }),
        h(
          'div',
          { class: `card form ${busy ? 'is-busy' : ''}` },
          h('label', { text: 'Come ti chiami?' }),
          name,
          h('button', { class: 'btn primary', text: 'Crea una stanza', onclick: () => !busy && this.actions.create(read()) }),
          h('div', { class: 'row' }, code, h('button', { class: 'btn', text: 'Entra con il codice', onclick: () => !busy && join() })),
          h('button', { class: 'btn ghost', text: 'Gioca da solo (senza server)', onclick: () => !busy && this.actions.solo(read()) }),
          this.busyText ? h('div', { class: 'note', text: this.busyText }) : null,
          this.titleError ? h('div', { class: 'note error', text: this.titleError }) : null,
        ),
        h('p', { class: 'foot', text: 'Fino a 8 giocatori · mouse e tastiera o gamepad · modelli KayKit (CC0)' }),
      ),
    );
    if (!this.name) name.focus();
  }

  // ---------------------------------------------------------------- heroes

  openHeroes(canClose: boolean): void {
    const lobby = this.lobby;
    if (!lobby) return;
    this.canClose = canClose;
    const mine = lobby.players.find((p) => p.id === this.myId)?.hero ?? '';
    const cards = HERO_IDS.map((id) => {
      const hero = HEROES[id];
      const owner = lobby.players.find((p) => p.hero === id);
      const taken = !!owner && owner.id !== this.myId;
      const region = REGIONS.find((r) => r.id === hero.home);
      return h(
        'button',
        {
          class: `hero-card ${mine === id ? 'is-mine' : ''} ${taken ? 'is-taken' : ''}`,
          style: `--c:${hero.color}`,
          onclick: () => {
            if (taken) {
              this.actions.sound('deny');
              return;
            }
            this.actions.sound('ui');
            this.actions.pickHero(id);
          },
        },
        h('div', { class: 'hero-head' }, portrait(id, hero.color, hero.code), h('div', {}, h('h3', { text: hero.name }), h('div', { class: 'hero-role', text: hero.role }))),
        h('p', { class: 'hero-style', text: hero.style }),
        h('ul', {},
          h('li', {}, h('b', { text: 'Passiva ' }), hero.passive),
          h('li', {}, h('b', { text: `${hero.ability.name} [E] ` }), hero.ability.desc),
          h('li', {}, h('b', { text: `${hero.ult.name} [R] ` }), hero.ult.desc),
        ),
        h('div', { class: 'hero-foot' },
          h('span', { text: `Vita ${hero.hp}` }),
          h('span', { text: `Vigore ${hero.stamina}` }),
          h('span', { text: region ? region.name : '' }),
        ),
        taken ? h('div', { class: 'hero-owner', text: `Scelto da ${owner.name}` }) : mine === id ? h('div', { class: 'hero-owner mine', text: 'Il tuo eroe' }) : null,
      );
    });
    this.show(
      'heroes',
      h(
        'div',
        { class: 'sheet' },
        h('header', {}, h('h2', { text: 'La Compagnia' }), h('p', { text: 'Ognuno sceglie il proprio eroe: ogni eroe può appartenere a un solo giocatore.' })),
        h('div', { class: 'hero-grid' }, ...cards),
        h(
          'footer',
          {},
          h('button', {
            class: `btn primary ${mine ? '' : 'disabled'}`,
            text: mine ? 'Entra nella taverna' : 'Scegli un eroe per continuare',
            onclick: () => {
              if (!mine) return;
              this.actions.sound('ui');
              this.close();
            },
          }),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- council map

  openCouncil(): void {
    const lobby = this.lobby;
    if (!lobby) return;
    const host = lobby.host === this.myId;
    const hostName = lobby.players.find((p) => p.id === lobby.host)?.name ?? '';
    const selected = missionById(lobby.mission);
    if (this.panel !== 'council' && selected) this.region = selected.region;
    const region = REGIONS.find((r) => r.id === this.region) ?? REGIONS[0]!;
    const mission = region.mission ? missionById(region.mission) : undefined;
    const byId = new Map(REGIONS.map((r) => [r.id, r]));

    const map = svg('svg', { viewBox: '540 420 560 420', class: 'salento' });
    map.append(
      svg('path', { d: 'M1010 420 C1075 500 1090 610 1068 700 C1050 770 1000 815 960 840 L1100 840 L1100 420 Z', class: 'sea' }),
      svg('path', { d: 'M1010 420 C1075 500 1090 610 1068 700 C1050 770 1000 815 960 840', class: 'coast' }),
    );
    for (const [a, b] of ROADS) {
      const ra = byId.get(a);
      const rb = byId.get(b);
      if (ra && rb) map.append(svg('line', { x1: ra.x, y1: ra.y, x2: rb.x, y2: rb.y, class: 'road' }));
    }
    for (const r of REGIONS) {
      const playable = !!r.mission;
      const g = svg('g', { class: `region ${playable ? 'playable' : 'locked'} ${r.id === this.region ? 'active' : ''} ${selected?.region === r.id ? 'chosen' : ''}` });
      g.style.setProperty('--c', r.color);
      if (playable) g.append(svg('circle', { cx: r.x, cy: r.y, r: 26, class: 'pulse' }));
      g.append(svg('circle', { cx: r.x, cy: r.y, r: playable ? 15 : 10, class: 'node' }));
      const label = svg('text', { x: r.x, y: r.y - (playable ? 24 : 18), class: 'label' });
      label.textContent = r.name;
      g.append(label);
      if (playable) {
        const order = svg('text', { x: r.x, y: r.y + 5, class: 'order' });
        order.textContent = String(missionById(r.mission!)?.order ?? '');
        g.append(order);
      }
      if (r.id === 'badiscar') {
        const here = svg('text', { x: r.x, y: r.y + 28, class: 'here' });
        here.textContent = 'Taverna di Carl';
        g.append(here);
      }
      g.addEventListener('click', () => {
        this.actions.sound('ui');
        this.region = r.id;
        if (host && r.mission && lobby.mission !== r.mission) this.actions.selectMission(r.mission);
        else this.openCouncil();
      });
      map.append(g);
    }

    const ready = lobby.players.every((p) => p.hero);
    this.show(
      'council',
      h(
        'div',
        { class: 'sheet council' },
        h('header', {}, h('h2', { text: 'La Tavola del Consiglio' }), h('p', { text: 'Il Salento sotto l’Eclissi. Le regioni numerate sono pronte per una spedizione.' })),
        h(
          'div',
          { class: 'council-body' },
          h('div', { class: 'map-box' }, map as unknown as Node),
          this.regionPanel(region, mission, host, hostName, ready, selected?.id ?? ''),
        ),
        h('footer', {}, h('button', { class: 'btn ghost', text: 'Torna in taverna', onclick: () => this.back() })),
      ),
    );
  }

  private regionPanel(
    region: RegionDef,
    mission: ReturnType<typeof missionById>,
    host: boolean,
    hostName: string,
    ready: boolean,
    selectedId: string,
  ): HTMLElement {
    const box = h(
      'div',
      { class: 'region-panel', style: `--c:${region.color}` },
      h('h3', { text: region.name }),
      h('div', { class: 'region-sub', text: `${region.subtitle} · ${region.realName}` }),
      h('p', { text: region.lore }),
      h('p', { class: 'gov' }, h('b', { text: 'Governo: ' }), region.government),
    );
    if (!mission) {
      box.append(h('div', { class: 'locked-note', text: 'Nessuna spedizione pronta: questa regione si aprirà in un prossimo capitolo.' }));
      return box;
    }
    box.append(
      h(
        'div',
        { class: 'mission' },
        h('div', { class: 'mission-order', text: `Spedizione ${mission.order} di ${MISSIONS.length}` }),
        h('h4', { text: mission.name }),
        h('div', { class: 'mission-place', text: mission.place }),
        h('p', { text: mission.brief }),
        h('div', { class: 'mission-stages', text: mission.stages.map((s) => s.title).join(' → ') }),
      ),
    );
    if (host) {
      const chosen = selectedId === mission.id;
      box.append(
        h('button', {
          class: `btn primary ${ready && chosen ? '' : 'disabled'}`,
          text: !chosen ? 'Seleziona questa spedizione' : ready ? 'Partite!' : 'Tutti devono scegliere un eroe',
          onclick: () => {
            if (!chosen) {
              this.actions.selectMission(mission.id);
              return;
            }
            if (!ready) {
              this.actions.sound('deny');
              return;
            }
            this.actions.sound('ui');
            this.actions.startMission();
          },
        }),
      );
    } else {
      box.append(
        h('div', {
          class: 'locked-note',
          text: selectedId === mission.id ? `${hostName} ha scelto questa spedizione: si parte quando dà il via.` : `Solo ${hostName} (chi ha creato la stanza) sceglie la spedizione.`,
        }),
      );
    }
    return box;
  }

  // ---------------------------------------------------------------- results

  openResults(): void {
    const lobby = this.lobby;
    if (!lobby || (lobby.phase !== 'victory' && lobby.phase !== 'defeat')) {
      if (this.panel === 'results') this.close();
      return;
    }
    const win = lobby.phase === 'victory';
    const mission = missionById(lobby.mission);
    const host = lobby.host === this.myId;
    const hostName = lobby.players.find((p) => p.id === lobby.host)?.name ?? '';
    const cols: [string, keyof LobbyState['stats'][string]][] = [
      ['Danni', 'dmg'], ['Uccisioni', 'kills'], ['Esecuzioni', 'execs'], ['Parate perfette', 'parries'],
      ['Schivate perfette', 'dodges'], ['Rianimazioni', 'revives'], ['Cadute', 'downs'],
    ];
    const rows = lobby.players
      .filter((p) => p.hero)
      .map((p) => {
        const hero = HEROES[p.hero as HeroId];
        const st = lobby.stats[p.id];
        return h(
          'tr',
          { class: p.id === this.myId ? 'me-row' : '' },
          h('td', {}, h('div', { class: 'who', style: `--c:${hero.color}` }, portrait(hero.id, hero.color, hero.code, 'small'), h('span', { text: `${hero.short} · ${p.name}` }))),
          ...cols.map(([, k]) => h('td', { text: st ? String(Math.round(st[k])) : '—' })),
        );
      });
    this.show(
      'results',
      h(
        'div',
        { class: `sheet results ${win ? 'win' : 'lose'}` },
        h(
          'header',
          {},
          h('h2', { text: win ? 'Vittoria' : 'La Compagnia è caduta' }),
          h('p', {
            text: win
              ? `${mission?.name ?? ''} — l'Eclissi arretra di un passo.`
              : `${mission?.name ?? ''} — il Sole Nero non concede tregua, ma la taverna sì.`,
          }),
        ),
        h('table', { class: 'stats' }, h('thead', {}, h('tr', {}, h('th', { text: 'Eroe' }), ...cols.map(([label]) => h('th', { text: label })))), h('tbody', {}, ...rows)),
        h(
          'footer',
          {},
          host && !win ? h('button', { class: 'btn primary', text: 'Riprova da questa sala', onclick: () => this.actions.retry() }) : null,
          host ? h('button', { class: `btn ${win ? 'primary' : ''}`, text: 'Torna alla taverna', onclick: () => this.actions.toHub() }) : null,
          host ? null : h('div', { class: 'locked-note', text: `In attesa di ${hostName}…` }),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- help

  openHelp(code: string, offline: boolean): void {
    const link = `${location.origin}${location.pathname}?stanza=${code}`;
    this.show(
      'help',
      h(
        'div',
        { class: 'sheet help' },
        h('header', {}, h('h2', { text: 'Comandi e regole del duello' })),
        h(
          'div',
          { class: 'help-body' },
          h(
            'table',
            { class: 'controls' },
            h('thead', {}, h('tr', {}, h('th', { text: 'Azione' }), h('th', { text: 'Tastiera e mouse' }), h('th', { text: 'Gamepad' }))),
            h('tbody', {}, ...CONTROLS.map(([a, k, p]) => h('tr', {}, h('td', { text: a }), h('td', { text: k }), h('td', { text: p })))),
          ),
          h(
            'div',
            { class: 'tips' },
            h('p', {}, h('b', { class: 'blue', text: 'Lampo azzurro: ' }), 'il colpo si può parare. Alza la guardia un attimo prima dell’impatto per una parata perfetta che sbilancia il nemico.'),
            h('p', {}, h('b', { class: 'red', text: 'Lampo rosso: ' }), 'colpo imparabile. Schiva: se lo fai all’ultimo istante ottieni un Contrattacco (danni quasi doppi per tre secondi).'),
            h('p', {}, h('b', { text: 'Barra gialla: ' }), 'è l’equilibrio del nemico. Quando si riempie il nemico è Spezzato: avvicinati e premi F per l’esecuzione.'),
            h('p', {}, h('b', { text: 'A terra: ' }), 'un compagno può rialzarti tenendo premuto F accanto a te. Se cadono tutti, la spedizione fallisce.'),
            offline
              ? h('p', { class: 'note', text: 'Stai giocando da solo, senza server.' })
              : h(
                  'p',
                  { class: 'note' },
                  `Stanza ${code} — invita gli amici con questo link: `,
                  h('a', {
                    text: link,
                    attrs: { href: link },
                    onclick: (e) => {
                      e.preventDefault();
                      void navigator.clipboard?.writeText(link).then(() => this.toast('Link copiato.'));
                    },
                  }),
                ),
          ),
        ),
        h(
          'footer',
          {},
          h('button', { class: 'btn primary', text: 'Riprendi', onclick: () => this.back() }),
          h('button', { class: 'btn ghost', text: 'Esci dalla stanza', onclick: () => this.actions.leave() }),
        ),
      ),
    );
  }

  private back(): void {
    this.actions.sound('uiBack');
    this.close();
  }

  /** Esc: closes whatever can be closed. Returns true when it did something. */
  escape(): boolean {
    if (this.panel === 'help' || this.panel === 'council' || (this.panel === 'heroes' && this.canClose)) {
      this.back();
      return true;
    }
    return false;
  }
}

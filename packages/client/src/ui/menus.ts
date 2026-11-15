import {
  ALL_HUBS,
  BESTIARY,
  DAMAGE_KIND_LABELS,
  HEROES,
  HERO_IDS,
  HUB_META,
  MISSIONS,
  PUBLIC_ROOM_ID,
  REGIONS,
  arenaPlays,
  biomeTrafficLight,
  bossPlays,
  hubIdFromRegion,
  missionById,
  xpProgress,
  type HeroId,
  type HubId,
  type LobbyState,
  type MissionDef,
  type RegionDef,
} from '@malampu/shared';
import { h, portrait, svg } from './dom';

export interface MenuActions {
  create(name: string): void;
  join(name: string, code: string): void;
  /** Walk into the tavern the server keeps open. */
  joinPublic(name: string): void;
  solo(name: string): void;
  pickHero(id: HeroId): void;
  releaseHero(): void;
  selectMission(id: string): void;
  selectHub(hubId: HubId): void;
  selectContract(id: string): void;
  startMission(): void;
  retry(): void;
  toHub(): void;
  changeHero(): void;
  leave(): void;
  sound(id: 'ui' | 'uiBack' | 'deny'): void;
  /** Called whenever a panel opens or closes. */
  changed(): void;
  /** Local XP total for a hero. */
  progressOf(id: HeroId): number;
  /** Equipped weapon damage types for the traffic light. */
  weaponDamageTypes(): string[];
}

export type Panel = 'none' | 'loading' | 'title' | 'heroes' | 'council' | 'results' | 'help' | 'bestiary';

const ROADS: [string, string][] = [
  ['malya', 'mur'], ['mur', 'minervin'], ['minervin', 'jugianel'], ['minervin', 'ujian'], ['ujian', 'otranth'],
  ['ujian', 'badiscar'], ['mur', 'sanarica'], ['malya', 'jugianel'], ['malya', 'sanarica'], ['otranth', 'badiscar'],
];

const CONTROLS: [string, string, string][] = [
  ['Movimento', 'W A S D', 'Levetta sinistra'],
  ['Visuale', 'Mouse', 'Levetta destra'],
  ['Attacco leggero (combo) / spell a distanza', 'J / Clic sinistro', 'X / Quadrato'],
  ['Attacco pesante (tieni premuto per caricare)', 'K / Clic destro', 'Y / Triangolo, RT'],
  ['Schivata (Anthon / Gabryel / Rycard: teletrasporto; altri: roll, teletrasporto a vigore alto)', 'Spazio', 'B / Cerchio'],
  ['Parata (premi all’ultimo istante per la parata perfetta)', 'Q (o Shift)', 'LB'],
  ['Aggancia bersaglio / cambia bersaglio', 'Tab o clic centrale / rotellina', 'R3 / croce direzionale'],
  ['Abilità distintiva', 'E', 'RB'],
  ['Suprema (quando la barra è piena)', 'R', 'LT'],
  ['Esecuzione, rianimare un alleato, tavolo del Consiglio, cattura/estrazione', 'F', 'A / Croce'],
  ['Tomo del Bestiario', 'B', '—'],
  ['Cambia / rilascia eroe (solo in taverna)', 'C', '—'],
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
  /** Council view: contracts board, legacy map, or special trials. */
  private councilTab: 'contracts' | 'map' | 'proves' = 'contracts';
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

  /** Brutal eclipse mark: Salento landscape behind, veiled goddess sigil in front. */
  private eclipseMark(): HTMLElement {
    const img = new Image();
    img.className = 'logo-sigil';
    img.alt = '';
    img.decoding = 'async';
    img.src = '/brand/sigil.png';
    return h('div', { class: 'logo-eclipse', attrs: { 'aria-hidden': 'true' } }, img);
  }

  private brandBlock(compact = false): HTMLElement {
    return h(
      'div',
      { class: `logo${compact ? ' logo-compact' : ''}` },
      this.eclipseMark(),
      h('div', { class: 'logo-copy' }, h('h1', { text: 'MALAMPU' }), h('h2', { text: "L'Eclissi della Dea Velata" })),
    );
  }

  loading(progress: number, text: string): void {
    if (this.panel !== 'loading') {
      this.show(
        'loading',
        h(
          'div',
          { class: 'loading brutal-stage' },
          this.brandBlock(true),
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
      if (e.key === 'Enter') (this.code ? join : () => this.actions.joinPublic(read()))();
    });
    this.show(
      'title',
      h(
        'div',
        { class: 'title brutal-stage' },
        h('h1', { class: 'title-wordmark', text: 'MALAMPU' }),
        h('p', { class: 'title-sub', text: "L'Eclissi della Dea Velata" }),
        h(
          'div',
          { class: 'title-stage' },
          this.eclipseMark(),
          h(
            'div',
            { class: `card form ${busy ? 'is-busy' : ''}` },
            h('label', { text: 'Come ti chiami?' }),
            name,
            h('button', {
              class: 'btn primary',
              text: 'Entra nella taverna pubblica',
              onclick: () => !busy && this.actions.joinPublic(read()),
            }),
            h('p', {
              class: 'note',
              text: `Sempre aperta (codice ${PUBLIC_ROOM_ID}): ti unisci a chi è già dentro. Se è piena se ne apre un’altra.`,
            }),
            h('div', { class: 'or', text: 'oppure' }),
            h('button', { class: 'btn', text: 'Crea una stanza privata', onclick: () => !busy && this.actions.create(read()) }),
            h('div', { class: 'row' }, code, h('button', { class: 'btn', text: 'Entra con il codice', onclick: () => !busy && join() })),
            h('button', { class: 'btn ghost', text: 'Gioca da solo (senza server)', onclick: () => !busy && this.actions.solo(read()) }),
            this.busyText ? h('div', { class: 'note', text: this.busyText }) : null,
            this.titleError ? h('div', { class: 'note error', text: this.titleError }) : null,
          ),
        ),
        h('p', {
          class: 'tagline',
          text: "L'Ordine del Sole Nero vuole spegnere ogni voce del Salento. Otto reietti, una taverna e una mappa: la Compagnia combatte insieme, mai l'uno contro l'altro.",
        }),
        h('p', { class: 'foot', text: 'Fino a 9 giocatori · tastiera, gamepad o comandi touch · modelli KayKit (CC0)' }),
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
    const inHub = lobby.phase === 'hub';
    const cards = HERO_IDS.map((id) => {
      const hero = HEROES[id];
      const owner = lobby.players.find((p) => p.hero === id);
      const taken = !!owner && owner.id !== this.myId;
      const region = REGIONS.find((r) => r.id === hero.home);
      const prog = xpProgress(this.actions.progressOf(id));
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
            // Clicking your current hero in the tavern releases them so someone else can take over.
            if (mine === id && inHub) this.actions.releaseHero();
            else this.actions.pickHero(id);
          },
        },
        h(
          'div',
          { class: 'hero-head' },
          portrait(id, hero.color, hero.code),
          h('div', {}, h('h3', { text: hero.name }), h('div', { class: 'hero-role', text: hero.role })),
          h('div', { class: 'hero-level', text: `Liv. ${prog.level}` }),
        ),
        h('p', { class: 'hero-style', text: hero.style }),
        h('p', { class: 'hero-lore', text: hero.desc }),
        h('div', {
          class: 'hero-xp',
          text: prog.level >= 20 ? 'Livello massimo' : `PE ${prog.into} / ${prog.need}`,
        }),
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
        taken
          ? h('div', { class: 'hero-owner', text: `Scelto da ${owner!.name}` })
          : mine === id
            ? h('div', { class: 'hero-owner mine', text: inHub ? 'Il tuo eroe · clic per rilasciarlo' : 'Il tuo eroe' })
            : null,
      );
    });
    this.show(
      'heroes',
      h(
        'div',
        { class: 'sheet' },
        h(
          'header',
          {},
          h('h2', { text: 'La Compagnia' }),
          h('p', {
            text: inHub
              ? 'Scegli o cambia eroe in taverna ([C]). Ogni eroe può appartenere a un solo giocatore; i PE salgono giocando nel tuo stile.'
              : 'La spedizione è già in corso. Scegli un eroe libero ed entra in campo.',
          }),
        ),
        h('div', { class: 'hero-grid' }, ...cards),
        h(
          'footer',
          {},
          h('button', {
            class: `btn primary ${mine ? '' : 'disabled'}`,
            text: mine ? (inHub ? 'Entra nella taverna' : 'Entra in campo') : 'Scegli un eroe per continuare',
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
    if (this.panel !== 'council' && selected) {
      this.region = selected.region;
      this.councilTab = selected.mode && selected.mode !== 'story' ? 'proves' : 'contracts';
    }
    const ready = lobby.players.every((p) => p.hero);
    const heroesReady = lobby.players.filter((p) => p.hero).length;

    const tabs = h(
      'div',
      { class: 'council-tabs' },
      h('button', {
        class: `tab ${this.councilTab === 'contracts' ? 'active' : ''}`,
        text: 'Bacheca',
        onclick: () => {
          this.councilTab = 'contracts';
          this.actions.sound('ui');
          this.openCouncil();
        },
      }),
      h('button', {
        class: `tab ${this.councilTab === 'map' ? 'active' : ''}`,
        text: 'Cronaca',
        onclick: () => {
          this.councilTab = 'map';
          this.actions.sound('ui');
          this.openCouncil();
        },
      }),
      h('button', {
        class: `tab ${this.councilTab === 'proves' ? 'active' : ''}`,
        text: 'Prove speciali',
        onclick: () => {
          this.councilTab = 'proves';
          this.actions.sound('ui');
          this.openCouncil();
        },
      }),
    );

    const body =
      this.councilTab === 'proves'
        ? this.provesPanel(host, hostName, ready, heroesReady, selected)
        : this.councilTab === 'map'
          ? this.mapPanel(host, hostName, ready, selected)
          : this.contractsPanel(host, hostName, ready);

    this.show(
      'council',
      h(
        'div',
        { class: 'sheet council' },
        h(
          'header',
          {},
          h('h2', { text: 'La Tavola del Consiglio' }),
          h('p', {
            text:
              this.councilTab === 'proves'
                ? 'Arene boss e fosse dove vince l’ultimo che resta in piedi. Niente processioni: solo spettacolo.'
                : this.councilTab === 'map'
                  ? 'Cronaca dell’Eclissi — le spedizioni leggendarie restano disponibili.'
                  : 'Contratti procedurali della regione. Scegliete un hub, poi un contratto dalla bacheca.',
          }),
          tabs,
        ),
        body,
        h('footer', {}, h('button', { class: 'btn ghost', text: 'Torna in taverna', onclick: () => this.back() })),
      ),
    );
  }

  openBestiary(): void {
    const hub = (this.lobby?.hubId as HubId | undefined) ?? hubIdFromRegion(this.region);
    const biome = HUB_META[hub].biome;
    const light = biomeTrafficLight(biome, this.actions.weaponDamageTypes());
    const lightLabel = light === 'green' ? 'Verde — vulnerabilità colpite' : light === 'red' ? 'Rosso — resistenze' : 'Giallo — neutro';
    const entries = BESTIARY.filter((e) => e.biome === biome);
    const rows = entries.map((e) =>
      h(
        'article',
        { class: `bestiary-card grade-${e.grade}` },
        h('div', { class: 'bestiary-index', text: String(e.index).padStart(2, '0') }),
        h('h4', { text: e.name }),
        h('div', { class: 'bestiary-grade', text: e.grade }),
        h('p', { text: e.desc }),
        h('p', { class: 'tip', text: e.tip }),
        h(
          'div',
          { class: 'mods' },
          e.vulnerability.length
            ? h('span', { class: 'vuln', text: `Vuln: ${e.vulnerability.map((v) => DAMAGE_KIND_LABELS[v] ?? v).join(', ')}` })
            : null,
          e.resistance.length
            ? h('span', { class: 'res', text: `Res: ${e.resistance.map((v) => DAMAGE_KIND_LABELS[v] ?? v).join(', ')}` })
            : null,
          e.immunity.length
            ? h('span', { class: 'imm', text: `Imm: ${e.immunity.map((v) => DAMAGE_KIND_LABELS[v] ?? v).join(', ')}` })
            : null,
        ),
      ),
    );
    this.show(
      'bestiary',
      h(
        'div',
        { class: 'sheet bestiary' },
        h(
          'header',
          {},
          h('h2', { text: 'Tomo del Bestiario' }),
          h('p', { text: `${HUB_META[hub].name} · Semaforo: ${lightLabel}` }),
        ),
        h('div', { class: 'bestiary-grid' }, ...rows),
        h('footer', {}, h('button', { class: 'btn ghost', text: 'Chiudi', onclick: () => this.back() })),
      ),
    );
  }

  private contractsPanel(host: boolean, hostName: string, ready: boolean): HTMLElement {
    const lobby = this.lobby!;
    const hub = (lobby.hubId as HubId | undefined) ?? 'badiscar';
    const hubs = ALL_HUBS.map((id) => {
      const meta = HUB_META[id];
      const active = id === hub;
      return h('button', {
        class: `btn hub-chip ${active ? 'primary' : 'ghost'}`,
        text: meta.name.replace(/^La |^Il /, ''),
        onclick: () => {
          if (!host) {
            this.actions.sound('deny');
            return;
          }
          this.actions.sound('ui');
          this.actions.selectHub(id);
        },
      });
    });
    const contracts = lobby.contracts ?? [];
    const cards = contracts.map((c) => {
      const chosen = lobby.contractId === c.id;
      const light = biomeTrafficLight(c.biome as 'urban' | 'coastal' | 'wild', this.actions.weaponDamageTypes());
      return h(
        'article',
        { class: `prove-card contract ${chosen ? 'chosen' : ''}` },
        h('div', { class: 'prove-tag', text: `${c.kind.replace(/_/g, ' ')} · ★${c.danger}` }),
        h('h4', { text: c.name }),
        h('div', { class: `semaforo ${light}`, text: light === 'green' ? 'Semaforo verde' : light === 'red' ? 'Semaforo rosso' : 'Semaforo giallo' }),
        h('p', { text: c.brief }),
        h('div', { class: 'mission-place', text: c.rewardHint }),
        host
          ? h('button', {
              class: `btn ${chosen ? 'primary' : 'ghost'}`,
              text: !chosen ? 'Seleziona' : ready ? 'Partite dal varco / Avvia' : 'Tutti devono scegliere un eroe',
              onclick: () => {
                if (!chosen) {
                  this.actions.sound('ui');
                  this.actions.selectContract(c.id);
                  return;
                }
                if (!ready) {
                  this.actions.sound('deny');
                  return;
                }
                this.actions.sound('ui');
                this.actions.startMission();
              },
            })
          : h('div', {
              class: 'locked-note',
              text: chosen ? `${hostName} ha scelto questo contratto.` : `Solo ${hostName} sceglie il contratto.`,
            }),
      );
    });
    return h(
      'div',
      { class: 'council-body proves' },
      h('div', { class: 'hub-row' }, ...hubs),
      h('div', { class: 'prove-list' }, ...cards),
    );
  }

  private mapPanel(host: boolean, hostName: string, ready: boolean, selected: ReturnType<typeof missionById>): HTMLElement {
    const lobby = this.lobby!;
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
      const g = svg('g', {
        class: `region ${playable ? 'playable' : 'locked'} ${r.id === this.region ? 'active' : ''} ${selected?.region === r.id && !selected.mode ? 'chosen' : ''}`,
      });
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
        if (host) {
          const hub = hubIdFromRegion(r.id);
          if (lobby.hubId !== hub) this.actions.selectHub(hub);
          if (r.mission && lobby.mission !== r.mission) this.actions.selectMission(r.mission);
          else this.openCouncil();
        } else this.openCouncil();
      });
      map.append(g);
    }

    return h(
      'div',
      { class: 'council-body' },
      h('div', { class: 'map-box' }, map as unknown as Node),
      this.regionPanel(region, mission, host, hostName, ready, selected?.id ?? ''),
    );
  }

  private provesPanel(
    host: boolean,
    hostName: string,
    ready: boolean,
    heroesReady: number,
    selected: ReturnType<typeof missionById>,
  ): HTMLElement {
    const bosses = bossPlays();
    const arenas = arenaPlays();
    const pick = (m: MissionDef) => {
      if (!host) {
        this.actions.sound('deny');
        return;
      }
      this.actions.sound('ui');
      this.actions.selectMission(m.id);
    };
    const start = (m: MissionDef) => {
      if (!host) return;
      if (selected?.id !== m.id) {
        pick(m);
        return;
      }
      if (!ready) {
        this.actions.sound('deny');
        return;
      }
      if (m.mode === 'arena' && heroesReady < 2) {
        this.actions.sound('deny');
        return;
      }
      this.actions.sound('ui');
      this.actions.startMission();
    };
    const card = (m: MissionDef) => {
      const chosen = selected?.id === m.id;
      const arena = m.mode === 'arena';
      const canStart = ready && chosen && (!arena || heroesReady >= 2);
      return h(
        'article',
        { class: `prove-card ${arena ? 'arena' : 'boss'} ${chosen ? 'chosen' : ''}` },
        h('div', { class: 'prove-tag', text: arena ? 'Ultimo in piedi' : 'Arena boss' }),
        h('h4', { text: m.name }),
        h('div', { class: 'mission-place', text: m.place }),
        h('p', { text: m.brief }),
        host
          ? h('button', {
              class: `btn ${chosen ? 'primary' : 'ghost'} ${canStart || !chosen ? '' : 'disabled'}`,
              text: !chosen
                ? 'Seleziona'
                : arena && heroesReady < 2
                  ? 'Servono almeno due eroi'
                  : ready
                    ? 'Partite!'
                    : 'Tutti devono scegliere un eroe',
              onclick: () => start(m),
            })
          : h('div', {
              class: 'locked-note',
              text: chosen
                ? `${hostName} ha scelto questa prova: si parte quando dà il via.`
                : `Solo ${hostName} sceglie la prova.`,
            }),
      );
    };

    return h(
      'div',
      { class: 'council-body proves' },
      h(
        'div',
        { class: 'proves-col' },
        h('h3', { text: 'Arene boss' }),
        h('p', { class: 'proves-lead', text: 'Uno contro uno spettacolo: la Compagnia insieme, i giganti al centro.' }),
        ...bosses.map(card),
      ),
      h(
        'div',
        { class: 'proves-col' },
        h('h3', { text: 'Ultimo in piedi' }),
        h('p', { class: 'proves-lead', text: 'Niente mostri. Niente rianimazioni. Vince chi resta in piedi.' }),
        ...arenas.map(card),
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
          text: selectedId === mission.id
            ? `${hostName} ha scelto questa spedizione: si parte quando dà il via.`
            : this.lobby?.public
              ? `Solo ${hostName} guida la spedizione: è il primo arrivato nella taverna.`
              : `Solo ${hostName} guida la spedizione.`,
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
    const contract = lobby.contracts?.find((c) => c.id === lobby.contractId) ?? lobby.contracts?.find((c) => c.id === lobby.mission);
    const host = lobby.host === this.myId;
    const hostName = lobby.players.find((p) => p.id === lobby.host)?.name ?? '';
    const cols: [string, keyof LobbyState['stats'][string]][] = [
      ['Danni', 'dmg'], ['Uccisioni', 'kills'], ['Esecuzioni', 'execs'], ['Parate', 'parries'],
      ['Schivate', 'dodges'], ['Cure', 'heals'], ['Abilità', 'casts'], ['Supreme', 'ults'],
      ['Rianimazioni', 'revives'], ['Cadute', 'downs'],
    ];
    const rows = lobby.players
      .filter((p) => p.hero)
      .map((p) => {
        const hero = HEROES[p.hero as HeroId];
        const st = lobby.stats[p.id];
        const gain = lobby.xpGain[p.id] ?? 0;
        const label = `${hero.short} · ${p.name} · liv. ${p.level}${gain ? ` · +${gain} PE` : ''}`;
        return h(
          'tr',
          { class: p.id === this.myId ? 'me-row' : '' },
          h('td', {}, h('div', { class: 'who', style: `--c:${hero.color}` }, portrait(hero.id, hero.color, hero.code, 'small'), h('span', { text: label }))),
          ...cols.map(([, k]) => h('td', { text: st ? String(Math.round(st[k] ?? 0)) : '—' })),
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
          h('h2', {
            text: win
              ? mission?.mode === 'arena'
                ? 'Ultimo in piedi'
                : 'Vittoria'
              : mission?.mode === 'arena'
                ? 'Nessun vincitore'
                : 'La Compagnia è caduta',
          }),
          h('p', {
            text: win
              ? mission?.mode === 'arena'
                ? `${mission.name} — uno solo resta. Gli altri pagano il vino.`
                : mission?.mode === 'boss'
                  ? `${mission.name} — il cerchio ha scelto i suoi campioni.`
                  : `${mission?.name ?? contract?.name ?? 'Contratto'} — l'Eclissi arretra di un passo.`
              : mission?.mode === 'arena'
                ? `${mission.name} — tutti a terra. La Fossa non premia nessuno.`
                : `${mission?.name ?? contract?.name ?? 'Contratto'} — il Sole Nero non concede tregua, ma la taverna sì.`,
          }),
        ),
        h('table', { class: 'stats' }, h('thead', {}, h('tr', {}, h('th', { text: 'Eroe' }), ...cols.map(([label]) => h('th', { text: label })))), h('tbody', {}, ...rows)),
        h(
          'footer',
          {},
          host && !win ? h('button', { class: 'btn primary', text: 'Riprova da questa sala', onclick: () => this.actions.retry() }) : null,
          host
            ? h('button', {
                class: `btn ${win ? 'primary' : ''}`,
                text: 'Torna alla taverna',
                onclick: () => this.actions.toHub(),
              })
            : null,
          h('button', {
            class: 'btn ghost',
            text: 'Cambia eroe',
            onclick: () => {
              this.actions.sound('ui');
              this.actions.changeHero();
            },
          }),
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
            h('p', {}, h('b', { text: 'Schermo touch: ' }), 'la levetta a sinistra muove l’eroe e i comandi stanno a destra. Trascina un punto libero dello schermo per girare la visuale. Pausa e Scheda sono in alto a destra.'),
            h('p', {}, h('b', { class: 'blue', text: 'Lampo azzurro: ' }), 'il colpo si può parare. Alza la guardia un attimo prima dell’impatto per una parata perfetta che sbilancia il nemico.'),
            h('p', {}, h('b', { class: 'red', text: 'Lampo rosso: ' }), 'colpo imparabile. Schiva: se lo fai all’ultimo istante ottieni un Contrattacco (danni quasi doppi per tre secondi).'),
            h('p', {}, h('b', { text: 'Barra gialla: ' }), 'è l’equilibrio del nemico. Quando si riempie il nemico è Spezzato: avvicinati e premi F per l’esecuzione.'),
            h('p', {}, h('b', { text: 'A terra: ' }), 'un compagno può rialzarti tenendo premuto F accanto a te. Se cadono tutti, la spedizione fallisce.'),
            offline
              ? h('p', { class: 'note', text: 'Stai giocando da solo, senza server.' })
              : this.lobby?.public
                ? h(
                    'p',
                    { class: 'note' },
                    `Taverna pubblica ${code}. Chiunque può entrare dal titolo, senza codice. Il primo arrivato guida la spedizione. Link diretto: `,
                    h('a', {
                      text: link,
                      attrs: { href: link },
                      onclick: (e) => {
                        e.preventDefault();
                        void navigator.clipboard?.writeText(link).then(() => this.toast('Link copiato.'));
                      },
                    }),
                  )
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
    if (this.panel === 'help' || this.panel === 'council' || this.panel === 'bestiary' || (this.panel === 'heroes' && this.canClose)) {
      this.back();
      return true;
    }
    return false;
  }
}

import {
  ABILITY_SLOTS,
  BOUNTIES,
  BOUNTY_BY_ID,
  CITIES,
  CITY_BOSS_STAGE,
  CITY_IDS,
  cityUnlocked,
  COSMETICS,
  COSMETIC_KINDS,
  COSMETIC_KIND_NAMES,
  ENEMIES,
  ENEMY_IDS,
  HEROES,
  LOCKED_REGIONS,
  NPCS,
  PUBLIC_ROOM_ID,
  REGION,
  abilityTooltip,
  canBuyNode,
  emptyProfile,
  loadoutOf,
  npcLine,
  treeOf,
  treeSpent,
  treeView,
  type AbilitySlot,
  type CityId,
  type ClientMsg,
  type CosmeticDef,
  type CosmeticKind,
  type EnemyDef,
  type HeroId,
  type LobbyState,
  type NpcId,
  type ShopSlot,
  type TreeRow,
  type Profile,
  type Purse,
  type RunReport,
} from '@malampu/shared';
import { h } from './dom';

export interface MenuActions {
  create(name: string): void;
  join(name: string, code: string): void;
  /** Walk into the tavern the server keeps open. */
  joinPublic(name: string): void;
  solo(name: string): void;
  /** Everything the hub panels do goes to the host as a plain message. */
  send(msg: ClientMsg): void;
  /** Back to the Hero Selection screen (hub only). */
  changeHero(): void;
  leave(): void;
  sound(id: 'ui' | 'uiBack' | 'deny'): void;
  /** Called whenever a panel opens or closes. */
  changed(): void;
}

export type Panel = 'none' | 'loading' | 'title' | 'help' | 'bestiary' | 'report' | NpcId;

const CONTROLS: [string, string, string][] = [
  ['Movimento (relativo allo schermo: W è sempre verso l’alto)', 'W A S D', 'Levetta sinistra'],
  ['Mira', 'Cursore del mouse', 'Direzione di movimento'],
  ['Ruota la visuale di 360°', 'Tieni premuta la rotellina e trascina', 'Levetta destra'],
  ['Zoom', 'Rotellina', '—'],
  ['Attacco leggero (combo)', 'Clic sinistro / J', 'X / Quadrato'],
  ['Attacco pesante (tieni premuto per caricare)', 'Clic destro / K', 'Y / Triangolo, RT'],
  ['Schivata', 'Spazio', 'B / Cerchio'],
  ['Parata (all’ultimo istante: parata perfetta)', 'Q o Shift', 'LB'],
  ['Speciale', 'E', 'RB'],
  ['Ultimate (quando è carica)', 'R', 'LT'],
  ['Interagisci: forzieri, santuari, portale, PNG, esecuzioni, rianimare', 'F (tieni premuto per canalizzare)', 'A / Croce'],
  ['Segnala un punto alla Compagnia', 'G (sul cursore)', 'Croce direzionale su'],
  ['Aggancia / sgancia un bersaglio', 'Tab', 'R3'],
  ['Scheda Eroe', 'I', '—'],
  ['Voto al Portale', '1 rientra · 2 prosegui', 'Pulsanti a schermo'],
  ['Bestiario', 'B', '—'],
  ['Cambia eroe (solo in taverna)', 'C', '—'],
  ['Aiuto / pausa', 'H o Esc', 'Start'],
  ['Mappa tattica', 'M', '—'],
  ['Audio sì/no', 'N', '—'],
];

const RANK_NAMES: Record<EnemyDef['rank'], string> = {
  base: 'Nemico base',
  elite: 'Élite',
  mini: 'Mini-Boss',
  city: 'Boss di Città',
  region: 'Boss di Regione',
};

const RANK_ORDER: EnemyDef['rank'][] = ['base', 'elite', 'mini', 'city', 'region'];

const STAGE_NAMES = ['Ambiente 1', 'Ambiente 2', 'Ambiente 3', 'Boss di Città'];

function purseText(p: Purse | undefined): string {
  if (!p || (p.gems === 0 && p.threads === 0)) return 'niente';
  const parts: string[] = [];
  if (p.gems) parts.push(`${p.gems} Gemme dell'Eclissi`);
  if (p.threads) parts.push(`${p.threads} Fili d'Ombra`);
  return parts.join(' · ');
}

export class Menus {
  panel: Panel = 'none';
  private readonly root: HTMLElement;
  private readonly toastBox = h('div', { class: 'toasts' });
  private lobby: LobbyState | null = null;
  private profile: Profile = emptyProfile();
  private myId = '';
  private titleError = '';
  private busyText = '';
  private name = '';
  private code = '';
  /** Which line each NPC says next. */
  private readonly turns: Partial<Record<NpcId, number>> = {};
  private atelierTab: CosmeticKind = 'palette';
  /** Reports the player has already read. */
  private reportSeen = 0;

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
    const scroll = was === panel ? (this.root.querySelector('.sheet-body')?.scrollTop ?? 0) : 0;
    this.root.replaceChildren(...content.filter((c): c is Node => !!c));
    const body = this.root.querySelector('.sheet-body');
    if (body) body.scrollTop = scroll;
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

  private get me() {
    return this.lobby?.players.find((p) => p.id === this.myId);
  }

  private get hero(): HeroId | '' {
    return this.me?.hero ?? '';
  }

  private get isHost(): boolean {
    return !!this.lobby && this.lobby.host === this.myId;
  }

  private get hostName(): string {
    return this.lobby?.players.find((p) => p.id === this.lobby!.host)?.name ?? 'chi guida la Compagnia';
  }

  setLobby(lobby: LobbyState, myId: string): void {
    this.lobby = lobby;
    this.myId = myId;
    // The hub panels only make sense in the hub.
    if (lobby.phase !== 'hub' && this.isNpcPanel()) this.close();
    else this.refresh();
  }

  setProfile(profile: Profile): void {
    this.profile = profile;
    this.refresh();
  }

  private isNpcPanel(): boolean {
    return this.panel in NPCS;
  }

  private refresh(): void {
    switch (this.panel) {
      case 'tavolo':
      case 'iej':
      case 'saraya':
      case 'eleonora':
      case 'carl':
        this.openNpc(this.panel, false);
        break;
      case 'report':
        this.renderReport();
        break;
      default:
        break;
    }
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
      if (e.key === 'Enter') (this.code ? join : () => this.actions.joinPublic(read()))();
    });
    this.show(
      'title',
      h(
        'div',
        { class: 'title' },
        h('div', { class: 'logo' }, h('div', { class: 'logo-eclipse' }), h('h1', { text: 'MALAMPU' }), h('h2', { text: "L'Eclissi della Dea Velata" })),
        h('p', {
          class: 'tagline',
          text: "Qualcosa sale dal mare della Costa Est. Scegliete un eroe, radunatevi alla Taverna di Carl e scendete insieme: tre città, un Leviatano, e ogni volta la stessa domanda. Tornare con il bottino o spingersi oltre?",
        }),
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
        h('p', { class: 'foot', text: 'Roguelite d’azione cooperativo · da 1 a 9 giocatori · tastiera e mouse, gamepad o touch · mondo KayKit (CC0), eroi Meshy' }),
      ),
    );
    if (!this.name) name.focus();
  }

  // ---------------------------------------------------------------- hub panels

  /** Opens the panel of an NPC (or of the Map Table). */
  openNpc(id: NpcId, talk = true): void {
    if (!this.lobby || this.lobby.phase !== 'hub') return;
    if (talk) this.turns[id] = (this.turns[id] ?? -1) + 1;
    const npc = NPCS[id];
    const body =
      id === 'tavolo'
        ? this.tableBody()
        : id === 'iej'
          ? this.treeBody()
          : id === 'saraya'
            ? this.atelierBody()
            : id === 'eleonora'
              ? this.bountyBody()
              : this.carlBody();
    this.show(
      id,
      h(
        'div',
        { class: `sheet npc npc-${id}`, style: `--c:${npc.color}` },
        h(
          'header',
          {},
          h('h2', { text: npc.name }),
          h('div', { class: 'npc-role', text: npc.role }),
          h('p', { class: 'npc-line', text: `«${npcLine(id, this.hero, this.turns[id] ?? 0)}»` }),
          h(
            'div',
            { class: 'bank' },
            h('span', { class: 'purse-gems', text: `${this.profile.gems} Gemme dell'Eclissi` }),
            h('span', { class: 'purse-threads', text: `${this.profile.threads} Fili d'Ombra` }),
          ),
        ),
        h('div', { class: 'sheet-body' }, ...body),
        h('footer', {}, h('button', { class: 'btn ghost', text: 'Chiudi', onclick: () => this.back() })),
      ),
    );
  }

  private act(msg: ClientMsg): void {
    this.actions.sound('ui');
    this.actions.send(msg);
  }

  private tableBody(): HTMLElement[] {
    const lobby = this.lobby!;
    const table = lobby.table;
    const host = this.isHost;
    const waiting = lobby.players.filter((p) => !p.ready).length;
    const go = (city: string, text: string, enabled: boolean): HTMLElement =>
      h('button', {
        class: `btn primary ${host && enabled ? '' : 'disabled'}`,
        text: host ? text : `Decide ${this.hostName}`,
        onclick: () => {
          if (!host || !enabled) {
            this.actions.sound('deny');
            return;
          }
          this.act({ t: 'run', city });
          this.close();
        },
      });
    const cities = CITY_IDS.map((id: CityId) => {
      const city = CITIES[id];
      const cp = Math.max(0, Math.min(CITY_BOSS_STAGE, table.checkpoint[id] ?? 0));
      const cleared = table.cleared.includes(id);
      const open = cityUnlocked(table.cleared, id);
      const prev = CITY_IDS[CITY_IDS.indexOf(id) - 1];
      return h(
        'article',
        { class: `city-card ${cleared ? 'is-cleared' : ''} ${open ? '' : 'is-locked'}`, style: `--c:${city.color}` },
        h('h3', { text: city.name }),
        h('div', { class: 'city-sub', text: city.subtitle }),
        h('p', { text: city.blurb }),
        h(
          'ol',
          { class: 'city-stages' },
          ...city.environments.map((env, i) =>
            h('li', { class: i < cp ? 'done' : i === cp ? 'next' : '' }, h('b', { text: `Ambiente ${i + 1} · ` }), `${env.name} — Mini-Boss: ${ENEMIES[env.miniBoss].name}`),
          ),
          h('li', { class: cp >= CITY_BOSS_STAGE ? 'next boss' : 'boss' }, h('b', { text: 'Boss di Città · ' }), `${city.boss.name} — ${ENEMIES[city.boss.boss].name}`),
        ),
        h('div', {
          class: 'city-state',
          text: open
            ? `${cleared ? 'Boss sconfitto · ' : ''}Checkpoint: ${STAGE_NAMES[cp]}`
            : `Sigillata: prima deve cadere ${CITIES[prev!].name}.`,
        }),
        go(id, `Parti da ${STAGE_NAMES[cp]}`, open),
      );
    });
    const boss = h(
      'article',
      { class: `city-card region-boss ${table.regionBoss ? '' : 'is-locked'} ${table.regionCleared ? 'is-cleared' : ''}` },
      h('h3', { text: ENEMIES[REGION.boss.boss].name }),
      h('div', { class: 'city-sub', text: `Boss di Regione · ${REGION.boss.name}` }),
      h('p', { text: REGION.boss.blurb }),
      h('div', {
        class: 'city-state',
        text: table.regionCleared
          ? 'Sconfitto. Potete sfidarlo ancora.'
          : table.regionBoss
            ? 'La via per l’Abisso è aperta.'
            : `Sigillato: servono i tre Boss di Città (${table.cleared.length} di ${CITY_IDS.length}).`,
      }),
      go('boss', 'Sfida il Leviatano', table.regionBoss),
    );
    const locked = LOCKED_REGIONS.map((r) =>
      h('article', { class: 'city-card is-locked future' }, h('h3', { text: r.name }), h('p', { text: r.blurb })),
    );
    return [
      h('h3', { class: 'section', text: `${REGION.subtitle} · ${REGION.name}` }),
      h('p', { class: 'note', text: REGION.blurb }),
      h('p', {
        class: 'note',
        text: host
          ? waiting > 0
            ? `Guidi tu la Compagnia. ${waiting === 1 ? 'Un eroe sta ancora scegliendo' : `${waiting} eroi stanno ancora scegliendo`}: partirà con voi appena conferma.`
            : 'Guidi tu la Compagnia: scegli la rotta. La progressione letta è la tua.'
          : `La rotta la sceglie ${this.hostName}. I checkpoint mostrati sono i suoi.`,
      }),
      h('div', { class: 'city-grid' }, ...cities),
      h('div', { class: 'city-grid' }, boss, ...locked),
    ];
  }

  private treeBody(): HTMLElement[] {
    const hero = this.hero;
    if (!hero) return [h('p', { class: 'note', text: 'Scegli prima un eroe.' })];
    const def = HEROES[hero];
    const tree = treeOf(this.profile, hero);
    const spent = treeSpent(hero, tree);
    const view = treeView(hero, tree);
    if (!view) return [h('p', { class: 'note', text: 'Questo eroe non ha un albero.' })];
    const buy = (slot: ShopSlot, row: TreeRow) => {
      const can = canBuyNode(hero, tree, slot, row.choice, this.profile.gems);
      const label = can.ok
        ? row.pick === 'branch'
          ? `Scegli questo ramo · ${row.cost} Gemme`
          : row.pick === 'wind'
            ? `Scegli questo vento · ${row.cost} Gemme`
            : `Sblocca · ${row.cost} Gemme`
        : can.why === 'gems'
          ? `Servono ${row.cost} Gemme`
          : can.why === 'path'
            ? 'Ramo già scelto'
            : can.why === 'wind'
              ? 'Vento già scelto'
              : 'Non ancora';
      return h('button', {
        class: `btn small ${can.ok ? 'primary' : 'disabled'}`,
        text: label,
        onclick: () => {
          if (!can.ok) {
            this.actions.sound('deny');
            return;
          }
          this.act({ t: 'tree', op: 'buy', slot, path: row.choice });
        },
      });
    };
    const lines = (slot: ShopSlot, rows: TreeRow[]) =>
      h(
        'ol',
        {},
        ...rows.map((row) =>
          h(
            'li',
            { class: row.got ? 'got' : row.next ? 'next' : '' },
            h('b', { text: `${row.cost} ` }),
            `${row.title}. ${row.effect}`,
            row.next ? buy(slot, row) : null,
          ),
        ),
      );
    const slotBlock = (slot: AbilitySlot): HTMLElement => {
      const tip = abilityTooltip(hero, slot, tree);
      const active = view[slot];
      const branches = active.branches.map((branch) =>
        h(
          'div',
          { class: `path ${tree[slot].branch === branch.id ? 'is-mine' : ''}` },
          h('h5', { text: branch.name }),
          h('p', { class: 'path-blurb', text: branch.focus }),
          lines(slot, branch.rows),
        ),
      );
      const key = slot === 'e' ? 'E' : 'R';
      return h(
        'section',
        { class: 'tree-slot' },
        h('h4', { text: `${slot === 'e' ? 'Speciale' : 'Ultimate'} [${key}] · ${tip.name}` }),
        h('p', { class: 'path-blurb', text: tip.desc }),
        h('p', {
          class: 'tree-now',
          text: `Tasto ${key}: ${tip.damage ? `${tip.damage} danni` : tip.healPct ? `cura ${tip.healPct}%` : 'nessun danno diretto'} · ricarica ${tip.cooldown} s · area ${tip.aoeCells} celle. I gradi sotto si aggiungono a questo lancio.`,
        }),
        lines(slot, active.shared),
        h('div', { class: 'paths' }, ...branches),
        tree[slot].tier > 0
          ? h('button', { class: 'btn small ghost', text: 'Rimborsa questa abilità (100%)', onclick: () => this.act({ t: 'tree', op: 'respec', slot }) })
          : null,
      );
    };
    const passive = view.passive;
    return [
      h('h3', { class: 'section', text: `Albero delle Abilità di ${def.name}` }),
      h('p', { class: 'note', text: 'Il nome accanto a [E] e [R] è l’abilità che premi in partita. Due gradi comuni, poi scegli un ramo e un vento: quei gradi si aggiungono a quel lancio. Il respec rimborsa tutte le Gemme.' }),
      h('section', { class: 'tree-slot' }, h('h4', { text: passive.name }), lines('p', passive.rows), lines('k', [passive.keystone])),
      ...ABILITY_SLOTS.map(slotBlock),
      h('button', {
        class: `btn ${spent === 0 ? 'primary' : 'disabled'}`,
        text: spent === 0 ? 'Applica build del Blueprint' : 'Respec prima di applicare la build',
        onclick: () => (spent === 0 ? this.act({ t: 'tree', op: 'blueprint', slot: '' }) : this.actions.sound('deny')),
      }),
      h('button', {
        class: `btn ${spent > 0 ? '' : 'disabled'}`,
        text: spent > 0 ? `Respec completo · riavrai ${spent} Gemme` : 'Nessuna Gemma spesa su questo eroe',
        onclick: () => (spent > 0 ? this.act({ t: 'tree', op: 'respec', slot: '' }) : this.actions.sound('deny')),
      }),
    ];
  }

  private atelierBody(): HTMLElement[] {
    const hero = this.hero;
    if (!hero) return [h('p', { class: 'note', text: 'Scegli prima un eroe.' })];
    const kind = this.atelierTab;
    const look = loadoutOf(this.profile, hero);
    const worn = kind === 'title' ? this.profile.title : look[kind];
    const tabs = h(
      'div',
      { class: 'tabs' },
      ...COSMETIC_KINDS.map((k) =>
        h('button', {
          class: `tab ${k === kind ? 'on' : ''}`,
          text: COSMETIC_KIND_NAMES[k],
          onclick: () => {
            this.atelierTab = k;
            this.actions.sound('ui');
            this.openNpc('saraya', false);
          },
        }),
      ),
    );
    const swatch = (c: CosmeticDef): string => {
      if (c.color) return `rgb(${c.color.map((v) => Math.round(v * 255)).join(',')})`;
      if (c.hue !== undefined) return `hsl(${c.hue} ${Math.round(Math.min(1, c.sat ?? 1) * 80)}% ${Math.round(Math.min(1.1, c.val ?? 1) * 45)}%)`;
      return 'transparent';
    };
    const cards = COSMETICS.filter((c) => c.kind === kind).map((c) => {
      const owned = this.profile.owned.includes(c.id);
      const on = worn === c.id;
      const afford = this.profile.threads >= c.cost;
      return h(
        'article',
        { class: `cosm-card ${on ? 'is-on' : ''} ${owned ? 'is-owned' : ''}` },
        h('i', { class: 'swatch', style: `background:${swatch(c)}` }),
        h('h5', { text: c.name }),
        h('p', { text: c.desc }),
        h('button', {
          class: `btn small ${owned ? (on ? '' : 'primary') : afford ? 'primary' : 'disabled'}`,
          text: owned ? (on ? 'Togli' : 'Indossa') : `Compra · ${c.cost} Fili`,
          onclick: () => {
            if (!owned && !afford) {
              this.actions.sound('deny');
              return;
            }
            if (owned) this.act({ t: 'cosm', op: 'equip', id: on ? '' : c.id, slot: kind });
            else this.act({ t: 'cosm', op: 'buy', id: c.id });
          },
        }),
      );
    });
    return [
      h('h3', { class: 'section', text: `Atelier · ${HEROES[hero].name}` }),
      h('p', { class: 'note', text: 'Solo estetica: nessun filo cambia un numero in combattimento. Palette, skin, effetti e pose valgono per l’eroe che stai usando; il titolo vale per te.' }),
      tabs,
      h('div', { class: 'cosm-grid' }, ...cards),
    ];
  }

  private bountyBody(): HTMLElement[] {
    const table = this.lobby!.table;
    if (!table.bounties) {
      return [
        h('p', { class: 'note', text: 'Il registro di Eleonora è chiuso. Si apre quando chi guida la Compagnia ha abbattuto il primo Boss di Città.' }),
      ];
    }
    const host = this.isHost;
    const cards = BOUNTIES.map((b) => {
      const on = table.bounty === b.id;
      return h(
        'article',
        { class: `bounty-card ${on ? 'is-on' : ''}` },
        h('h5', { text: b.name }),
        h('p', { text: b.text }),
        h('div', { class: 'bounty-reward', text: `${b.reward} Fili d'Ombra a testa, all'estrazione` }),
        h('button', {
          class: `btn small ${host ? (on ? '' : 'primary') : 'disabled'}`,
          text: host ? (on ? 'Straccia il contratto' : 'Firma') : on ? 'Firmato' : `Firma ${this.hostName}`,
          onclick: () => (host ? this.act({ t: 'bounty', id: on ? '' : b.id }) : this.actions.sound('deny')),
        }),
      );
    });
    return [
      h('h3', { class: 'section', text: 'Bounties' }),
      h('p', {
        class: 'note',
        text: `Un contratto alla volta, firmato da chi guida la Compagnia e valido per tutti nella prossima spedizione. ${table.bounty ? `In corso: ${BOUNTY_BY_ID[table.bounty]?.name ?? ''}.` : 'Nessun contratto firmato.'}`,
      }),
      h('div', { class: 'bounty-grid' }, ...cards),
    ];
  }

  private carlBody(): HTMLElement[] {
    return [
      h('h3', { class: 'section', text: 'La Taverna di Carl' }),
      h('p', { class: 'note', text: 'Qui non si combatte. Il Tavolo della Mappa è al centro, Carl è al bancone a nord, Iej tiene l’Albero delle Abilità, Saraya cuce, Eleonora paga i contratti. I fantocci accanto all’ingresso non rispondono ai colpi.' }),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn', text: 'Un’altra parola', onclick: () => (this.actions.sound('ui'), this.openNpc('carl')) }),
        h('button', { class: 'btn', text: 'Cambia eroe', onclick: () => (this.close(), this.actions.changeHero()) }),
        h('button', { class: 'btn', text: 'Bestiario della Costa Est', onclick: () => (this.actions.sound('ui'), this.openBestiary()) }),
      ),
    ];
  }

  // ---------------------------------------------------------------- report

  /** Opens the end-of-expedition report once per report. */
  maybeReport(): void {
    const rep = this.lobby?.report;
    if (!rep || rep.n <= this.reportSeen || this.lobby?.phase !== 'hub') return;
    if (this.panel !== 'none' && this.panel !== 'report') return;
    this.reportSeen = rep.n;
    this.renderReport();
  }

  /** Reports issued before this player arrived are not theirs to read. */
  skipReports(): void {
    this.reportSeen = this.lobby?.report?.n ?? 0;
  }

  private renderReport(): void {
    const rep: RunReport | null | undefined = this.lobby?.report;
    if (!rep) {
      this.close();
      return;
    }
    const titles: Record<RunReport['kind'], [string, string]> = {
      extract: ['Estrazione riuscita', 'I Manufatti nella bisaccia sono in banca e il checkpoint della Città è salvato.'],
      city: ['Boss di Città abbattuto', 'La Città è libera. Tutto il bottino è in banca.'],
      region: ['Il Leviatano è caduto', 'La Costa Est respira. Le prossime Regioni si apriranno da qui.'],
      wipe: ['La Compagnia è caduta', 'Il mare brucia il 30% del bottino raccolto nell’ultimo Ambiente. Il resto torna in taverna con voi.'],
    };
    const [title, sub] = titles[rep.kind];
    const rows = Object.keys(rep.stats).map((id) => {
      const st = rep.stats[id]!;
      const name = this.lobby?.players.find((p) => p.id === id)?.name ?? '—';
      return h(
        'tr',
        { class: id === this.myId ? 'mine' : '' },
        h('td', { text: name }),
        h('td', { text: String(Math.round(st.dmg)) }),
        h('td', { text: String(Math.round(st.taken)) }),
        h('td', { text: String(st.kills) }),
        h('td', { text: String(st.downs) }),
        h('td', { text: String(st.revives) }),
      );
    });
    const bounty = rep.bounty ? BOUNTY_BY_ID[rep.bounty] : undefined;
    this.show(
      'report',
      h(
        'div',
        { class: `sheet report kind-${rep.kind}` },
        h('header', {}, h('h2', { text: title }), h('div', { class: 'npc-role', text: rep.label }), h('p', { text: sub })),
        h(
          'div',
          { class: 'sheet-body' },
          h(
            'div',
            { class: 'report-loot' },
            h('div', {}, h('b', { text: 'In banca: ' }), purseText(rep.banked[this.myId])),
            rep.kind === 'wipe' ? h('div', { class: 'tax' }, h('b', { text: 'Tassa di Morte: ' }), purseText(rep.taxed[this.myId])) : null,
            bounty ? h('div', {}, h('b', { text: `Contratto «${bounty.name}»: ` }), rep.bountyPaid > 0 ? `pagato, ${rep.bountyPaid} Fili d'Ombra a testa` : 'non riuscito') : null,
            h('div', {}, h('b', { text: 'Totale: ' }), `${this.profile.gems} Gemme dell'Eclissi · ${this.profile.threads} Fili d'Ombra`),
          ),
          rows.length
            ? h(
                'table',
                { class: 'controls stats' },
                h('thead', {}, h('tr', {}, ...['Eroe', 'Danni inflitti', 'Danni subiti', 'Uccisioni', 'A terra', 'Rianimazioni'].map((t) => h('th', { text: t })))),
                h('tbody', {}, ...rows),
              )
            : null,
        ),
        h('footer', {}, h('button', { class: 'btn primary', text: 'Torna in taverna', onclick: () => this.back() })),
      ),
    );
  }

  // ---------------------------------------------------------------- bestiary and help

  openBestiary(): void {
    const groups = RANK_ORDER.map((rank) => {
      const list = ENEMY_IDS.map((id) => ENEMIES[id]).filter((e) => e.rank === rank && !e.dummy);
      if (list.length === 0) return null;
      return h(
        'section',
        {},
        h('h3', { class: 'section', text: RANK_NAMES[rank] }),
        h(
          'div',
          { class: 'bestiary-grid' },
          ...list.map((e) =>
            h(
              'article',
              { class: `bestiary-card rank-${e.rank}` },
              h('h4', { text: e.name }),
              h('p', { text: e.desc }),
              h(
                'div',
                { class: 'mods' },
                h('span', { text: `Vita ${e.hp}` }),
                e.armor ? h('span', { class: 'res', text: `Scudo frontale −${Math.round(e.armor * 100)}% (fisico)` }) : null,
                e.burrow ? h('span', { class: 'imm', text: 'Si interra nei canali bassi' }) : null,
                e.ranged ? h('span', { text: 'A distanza' }) : null,
                e.rank !== 'base' && e.rank !== 'elite' ? h('span', { class: 'imm', text: 'Immune ai controlli · onda Anti-Zerg' }) : null,
                e.floods ? h('span', { class: 'imm', text: 'Allaga l’arena a ogni fase' }) : null,
              ),
            ),
          ),
        ),
      );
    });
    this.show(
      'bestiary',
      h(
        'div',
        { class: 'sheet bestiary' },
        h('header', {}, h('h2', { text: 'Bestiario' }), h('p', { text: `${REGION.subtitle} · ${REGION.name}` })),
        h('div', { class: 'sheet-body' }, ...groups.filter((g): g is HTMLElement => !!g)),
        h('footer', {}, h('button', { class: 'btn ghost', text: 'Chiudi', onclick: () => this.back() })),
      ),
    );
  }

  openHelp(code: string, offline: boolean): void {
    const link = `${location.origin}${location.pathname}?stanza=${code}`;
    const copy = h('a', {
      text: link,
      attrs: { href: link },
      onclick: (e) => {
        e.preventDefault();
        void navigator.clipboard?.writeText(link).then(() => this.toast('Link copiato.'));
      },
    });
    this.show(
      'help',
      h(
        'div',
        { class: 'sheet help' },
        h('header', {}, h('h2', { text: 'Comandi e regole della spedizione' })),
        h(
          'div',
          { class: 'sheet-body help-body' },
          h(
            'table',
            { class: 'controls' },
            h('thead', {}, h('tr', {}, h('th', { text: 'Azione' }), h('th', { text: 'Tastiera e mouse' }), h('th', { text: 'Gamepad' }))),
            h('tbody', {}, ...CONTROLS.map(([a, k, p]) => h('tr', {}, h('td', { text: a }), h('td', { text: k }), h('td', { text: p })))),
          ),
          h(
            'div',
            { class: 'tips' },
            h('p', {}, h('b', { text: 'Schermo touch: ' }), 'la levetta a sinistra muove l’eroe, i comandi stanno a destra. Trascina un punto libero dello schermo per ruotare la visuale.'),
            h('p', {}, h('b', { text: 'Niente livelli, niente zaino: ' }), 'gli eroi hanno statistiche fisse. In spedizione crescono solo Slancio e Sinergie, e si azzerano a ogni Ambiente.'),
            h('p', {}, h('b', { text: 'Quote: ' }), 'si sale e si scende di un piano alla volta. Chi colpisce dall’alto fa il 10% di danni in più; con due piani di dislivello la mischia non arriva.'),
            h('p', {}, h('b', { text: 'Forzieri di Sinergia: ' }), 'tieni premuto F per quattro secondi, indifeso. Il buff vale per tutta la Compagnia fino alla fine dell’Ambiente.'),
            h('p', {}, h('b', { text: 'Santuari di Cura: ' }), 'in fondo alle conche. Sono l’unica cura, insieme al globo che lascia il Mini-Boss.'),
            h('p', {}, h('b', { text: 'Portale: ' }), 'abbattuto il Mini-Boss, tutti votano. Rientrare mette il bottino in banca; proseguire tiene le ferite e alza il Fervore (+20%, +50%, +100% di bottino).'),
            h('p', {}, h('b', { text: 'Se cadete tutti: ' }), 'si torna in taverna e la Tassa di Morte brucia il 30% del bottino dell’Ambiente fallito.'),
            h('p', {}, h('b', { class: 'blue', text: 'Lampo azzurro: ' }), 'il colpo si può parare. ', h('b', { class: 'red', text: 'Lampo rosso: ' }), 'si può solo schivare.'),
            offline
              ? h('p', { class: 'note', text: 'Stai giocando da solo, senza server. I progressi restano su questo dispositivo.' })
              : h('p', { class: 'note' }, this.lobby?.public ? `Taverna pubblica ${code}. Link diretto: ` : `Stanza ${code} — invita la Compagnia con questo link: `, copy),
          ),
        ),
        h(
          'footer',
          {},
          h('button', { class: 'btn primary', text: 'Riprendi', onclick: () => this.back() }),
          h('button', { class: 'btn ghost', text: 'Bestiario', onclick: () => (this.actions.sound('ui'), this.openBestiary()) }),
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
    if (this.panel === 'none' || this.panel === 'loading' || this.panel === 'title') return false;
    this.back();
    return true;
  }
}

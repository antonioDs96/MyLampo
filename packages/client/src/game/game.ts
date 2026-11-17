import { Color3, Matrix, type Mesh, MeshBuilder, type Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import {
  Act,
  angleDiff,
  BOUNTY_BY_ID,
  Btn,
  channelTime,
  clonePlayer,
  COSMETIC_BY_ID,
  currentAttack,
  DT,
  ELEV_WALL,
  emptyProfile,
  emptyPurse,
  ENEMIES,
  enemyHas,
  ES,
  EState,
  FLOOD_DRY,
  getCellElevation,
  HEROES,
  HUB_LAYOUT,
  INTERP_DELAY_MS,
  layoutDefById,
  lerp,
  lerpAngle,
  loadoutOf,
  losClear,
  MAX_PLAYERS,
  NPCS,
  packCmds,
  parseLayout,
  personaOf,
  PS,
  quantizeCmd,
  standElevation,
  STEP_HEIGHT,
  stepPlayer,
  synergyInfo,
  TICK_HZ,
  TUNING,
  unpackEnemy,
  yawOf,
  type AllyLite,
  type AttackDef,
  type ClientMsg,
  type DropKind,
  type EnemyAttackDef,
  type EnemyLite,
  type EnemySnap,
  type GameEvent,
  type HeroId,
  type InputCmd,
  type Layout,
  type LobbyState,
  type NpcId,
  type PingKind,
  type PlayerEvent,
  type PlayerState,
  type PoiKind,
  type PoiLite,
  type Profile,
  type Purse,
  type ServerMsg,
  type Snapshot,
  type StepCtx,
  type WorldInfo,
} from '@malampu/shared';
import { HeroSelect, SLOT_COLORS } from '../ui/heroSelect';
import { HeroSheet } from '../ui/heroSheet';
import { Hud, type PartyEntry } from '../ui/hud';
import { Menus } from '../ui/menus';
import { Radar } from '../ui/radar';
import { LocalConnection, RemoteConnection, serverEndpoint, type Connection } from '../net/connection';
import { profileId, SoloProfileArchive } from '../net/profile';
import { Arena, FLOOR_Y } from './arena';
import type { Assets } from './assets';
import { Audio } from './audio';
import { IsoCamera } from './camera';
import { CharacterView, makeShadowSource, poseEnemy, posePlayer } from './character';
import { HeroStage } from './heroStage';
import { Input, type InputFrame } from './input';
import { screenToWorld } from './stick';
import { TouchControls } from './touch';
import { dressHero, ENEMY_LOOKS, lookKey, NPC_LOOKS, type RGB } from './looks';
import { Vfx } from './vfx';

const BLUE: RGB = [0.25, 0.65, 1];
const RED: RGB = [1, 0.16, 0.1];
const GOLD: RGB = [1, 0.78, 0.25];
const WHITE: RGB = [1, 1, 1];
const VIOLET: RGB = [0.62, 0.25, 1];
const GREEN: RGB = [0.35, 1, 0.5];
const ICE: RGB = [0.55, 0.9, 1];
const DARK: RGB = [0.12, 0.04, 0.2];
const TOXIC: RGB = [0.5, 0.95, 0.25];
const EMBER: RGB = [1, 0.45, 0.12];

const PROJ_COLOR: Record<string, RGB> = {
  bolt: [0.85, 0.92, 1],
  bolt_heavy: [0.7, 0.9, 1],
  light: [1, 0.85, 0.4],
  light_big: [1, 0.85, 0.4],
  light_orb: [1, 0.9, 0.55],
  orb: [0.7, 0.3, 1],
  orb_big: [0.8, 0.35, 1],
  dark: [1, 0.2, 0.45],
  harpoon: [0.8, 0.85, 0.9],
  spore: TOXIC,
};

const PING_COLOR: Record<PingKind, string> = { rally: '#58b4ff', danger: '#ff4d3d', chest: '#f2c14e', elite: '#c084fc' };
const PING_RGB: Record<PingKind, RGB> = { rally: BLUE, danger: RED, chest: GOLD, elite: VIOLET };
const PING_TEXT: Record<PingKind, string> = { rally: 'Raduno', danger: 'Pericolo', chest: 'Forziere', elite: 'Élite' };
const PING_LIFE = 9;

const POI_COLOR: Record<PoiKind, string> = { chest: '#f2c14e', shrine: '#5fe08a', portal: '#c084fc' };
const POI_NAME: Record<PoiKind, string> = { chest: 'Forziere di Sinergia', shrine: 'Santuario di Cura', portal: 'Portale di Estrazione' };
const CHANNEL_TEXT: Record<PoiKind, string> = { chest: 'Apri il forziere…', shrine: 'Attivi il santuario…', portal: 'Apri il portale…' };

const DROP_RGB: Record<DropKind, RGB> = { gem: [0.5, 0.7, 1], thread: [0.85, 0.35, 1], orb: GREEN };
const DROP_TEXT: Record<DropKind, string> = { gem: "Gemme dell'Eclissi", thread: "Fili d'Ombra", orb: 'Globo di cura' };
/** Loot within this distance drifts toward its owner. */
const DROP_MAGNET = 7;

function hexColor(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const HERO_COLOR = Object.fromEntries(Object.values(HEROES).map((h) => [h.id, hexColor(h.color)])) as Record<HeroId, RGB>;

interface Frame {
  recv: number;
  s: Snapshot;
  players: Map<string, PlayerState>;
  enemies: Map<number, EnemySnap>;
}

interface HeroView {
  view: CharacterView;
  hero: HeroId;
  /** Model and cosmetics this view was built for. */
  key: string;
  act: number;
  combo: number;
  t: number;
  x: number;
  z: number;
  yaw: number;
  /** Smoothed visual feet height. NaN until the first placement. */
  y: number;
  fullCharge: boolean;
  wolf: boolean;
  seen: boolean;
}

interface EnemyView {
  view: CharacterView;
  snap: EnemySnap;
  state: number;
  atk: number;
  seen: boolean;
  dustTimer: number;
  /** Smoothed visual feet height. NaN until the first placement. */
  y: number;
  /** 0 while dug into a channel, 1 on the surface. */
  surfaced: number;
}

interface NpcView {
  id: NpcId;
  view: CharacterView | null;
  x: number;
  z: number;
}

/** Instanced loot lying on the ground: only this client knows about it. */
interface DropView {
  id: number;
  kind: DropKind;
  x: number;
  z: number;
  amount: number;
  age: number;
}

interface PingMark {
  by: string;
  kind: PingKind;
  x: number;
  z: number;
  age: number;
}

const FAIL_TEXT: Record<string, string> = {
  stamina: 'Vigore insufficiente',
  cooldown: 'Speciale in ricarica',
  silence: 'Silenzio: nessuna abilità',
  ult: 'Ultimate non ancora pronta',
};

export class Game {
  readonly input: Input;
  readonly hud: Hud;
  private readonly touch: TouchControls;
  readonly menus: Menus;
  readonly audio = new Audio();
  private readonly cam: IsoCamera;
  private readonly stage: HeroStage;
  private readonly select: HeroSelect;
  private readonly sheet: HeroSheet;
  private readonly radar = new Radar();
  private readonly vfx: Vfx;
  private readonly shadow;
  private readonly water: Mesh;
  private waterY = 0;
  private conn: Connection | null = null;
  private myId = '';
  private myName = '';
  private lobby: LobbyState | null = null;
  private info: WorldInfo | null = null;
  private layout: Layout | null = null;
  private arena: Arena | null = null;
  private frames: Frame[] = [];
  private clockOffset = 0;
  /** Server clock of the picture last drawn: what the player was looking at when they pressed. */
  private shownClock = 0;
  private hasOffset = false;
  private me: PlayerState | null = null;
  private readonly pending: InputCmd[] = [];
  private readonly outbox: InputCmd[] = [];
  private seq = 0;
  private acc = 0;
  private errX = 0;
  private errZ = 0;
  private lockId = 0;
  private hitStop = 0;
  private predictedHitAt = -1e9;
  /** Last freezeHost passed to conn.setPaused — edge-trigger only. */
  private hostFreeze = false;
  private lastFrame = 0;
  private lastPing = 0;
  private rtt = 0;
  private prevButtons = 0;
  private readonly heroViews = new Map<string, HeroView>();
  private readonly enemyViews = new Map<number, EnemyView>();
  private npcViews: NpcView[] = [];
  private readonly blades: { id: number; who: string; text: string; until: number }[] = [];
  private enemiesLite: EnemyLite[] = [];
  private alliesLite: AllyLite[] = [];
  private poisLite: PoiLite[] = [];
  private readonly scratch: PlayerEvent[] = [];
  private readonly events: PlayerEvent[] = [];
  private readonly tmp = new Vector3();
  private readonly viewProj = new Matrix();
  private flameTimer = 0;
  private moteTimer = 0;
  private heroShown: HeroId | '' = '';
  private lastPhase = '';
  private fps = 60;
  /** What survives a run: banked currencies, Skill Tree, cosmetics, checkpoints. */
  private profile: Profile = emptyProfile();
  /** Unbanked loot of the current expedition. */
  private satchel: Purse = emptyPurse();
  private readonly drops = new Map<number, DropView>();
  private pings: PingMark[] = [];
  private flood = FLOOD_DRY;
  /** Where the cursor lands on the ground. */
  private readonly aimAt = { x: 0, z: 0 };
  private aim = 0;
  private meFeet = 0;
  private stageOn = false;
  private readonly moveDir = { x: 0, z: 0 };

  constructor(
    private readonly scene: Scene,
    private readonly assets: Assets,
    private readonly canvas: HTMLCanvasElement,
    ui: HTMLElement,
  ) {
    this.touch = new TouchControls(ui);
    this.input = new Input(canvas, this.touch);
    this.input.onPadStart = () => this.onKey('KeyH');
    this.stage = new HeroStage(scene, assets);
    this.cam = new IsoCamera(scene);
    this.vfx = new Vfx(scene);
    this.vfx.ground = (x, z) => this.groundY(x, z);
    this.shadow = makeShadowSource(scene);
    this.water = this.makeWater();
    this.hud = new Hud(ui);
    this.hud.radarSlot.append(this.radar.canvas);
    this.sheet = new HeroSheet(ui);
    this.sheet.onClose = () => this.toggleSheet();
    this.select = new HeroSelect(ui, {
      pick: (hero) => this.send({ t: 'hero', hero }),
      ready: (on) => this.send({ t: 'ready', on }),
      leave: () => this.leave(''),
      sound: (id) => this.audio.play(id),
    });
    this.hud.onOpenSheet = () => this.toggleSheet();
    this.hud.onVote = (choice) => this.send({ t: 'vote', choice });
    this.touch.onPause = () => this.onKey('KeyH');
    this.touch.onSheet = () => this.toggleSheet();
    this.touch.onPing = () => this.input.pressPing();
    this.menus = new Menus(ui, {
      create: (name) => void this.connect(name, null, false),
      join: (name, code) => void this.connect(name, code, false),
      joinPublic: (name) => void this.connect(name, null, false, true),
      solo: (name) => void this.connect(name, null, true),
      send: (msg) => this.send(msg),
      changeHero: () => this.changeHero(),
      leave: () => this.leave(''),
      sound: (id) => this.audio.play(id),
      changed: () => this.syncInput(),
    });
    this.input.onKey = (code) => this.onKey(code);
    window.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });
    window.addEventListener('keydown', () => this.audio.unlock(), { capture: true });
  }

  /** The toxic water the Leviatano raises: one flat sheet, lifted to the flooded elevation. */
  private makeWater(): Mesh {
    const mat = new StandardMaterial('flood', this.scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(0.16, 0.5, 0.2);
    mat.diffuseColor = Color3.Black();
    mat.specularColor = Color3.Black();
    mat.alpha = 0.62;
    mat.backFaceCulling = false;
    const mesh = MeshBuilder.CreateGround('flood', { width: 600, height: 600 }, this.scene);
    mesh.material = mat;
    mesh.isPickable = false;
    mesh.setEnabled(false);
    return mesh;
  }

  // ---------------------------------------------------------------- session

  private async connect(name: string, code: string | null, solo: boolean, pub = false): Promise<void> {
    this.audio.unlock();
    this.audio.play('ui');
    this.myName = name;
    if (solo) {
      const archive = new SoloProfileArchive(serverEndpoint());
      await archive.prefetch(profileId());
      this.attach(new LocalConnection(name, archive));
      return;
    }
    this.menus.busy(pub ? 'Entro nella taverna pubblica…' : code ? 'Entro nella stanza…' : 'Apro una nuova stanza…');
    try {
      this.attach(await RemoteConnection.open(name, code, pub));
    } catch (err) {
      this.audio.play('deny');
      this.menus.title(err instanceof Error ? err.message : String(err));
    }
  }

  private attach(conn: Connection): void {
    this.conn = conn;
    conn.onMessage = (msg, at) => this.onMessage(msg, at);
    conn.onClose = (reason) => this.leave(reason);
    this.lastPing = 0;
    this.rtt = 0;
    // The profile lives with the host: tell it which one is ours.
    this.send({ t: 'profile', id: profileId() });
  }

  private leave(reason: string): void {
    this.conn?.close();
    this.conn = null;
    this.info = null;
    this.lobby = null;
    this.me = null;
    this.myId = '';
    this.heroShown = '';
    this.lastPhase = '';
    this.frames = [];
    this.profile = emptyProfile();
    this.satchel = emptyPurse();
    this.drops.clear();
    this.pings = [];
    this.flood = FLOOD_DRY;
    this.water.setEnabled(false);
    this.clearViews(true);
    this.arena?.dispose();
    this.arena = null;
    this.layout = null;
    this.vfx.clear();
    this.hud.setVisible(false);
    this.hud.setVote(null);
    this.hud.clearTexts();
    this.select.setVisible(false);
    this.sheet.setVisible(false);
    this.audio.setMood('off');
    this.menus.title(reason);
    this.syncInput();
  }

  private send(msg: ClientMsg): void {
    this.conn?.send(msg);
  }

  private get myPlayer() {
    return this.lobby?.players.find((p) => p.id === this.myId);
  }

  private myHero(): HeroId | '' {
    return this.myPlayer?.hero ?? '';
  }

  /** True while the Hero Selection screen is where this player belongs. */
  private get selecting(): boolean {
    const me = this.myPlayer;
    return !!this.info && !!this.lobby && !!me && (!me.ready || this.lobby.phase === 'select');
  }

  /** Shows the screen this player should be looking at: Hero Selection, or the world. */
  private syncScreens(): void {
    const selecting = this.selecting;
    if (selecting) {
      if (this.sheet.isOpen) this.sheet.setVisible(false);
      if (this.menus.open && this.menus.panel !== 'help') this.menus.close();
    }
    this.select.setVisible(selecting);
    if (!selecting && this.info?.kind === 'hub') this.menus.maybeReport();
    this.syncInput();
  }

  private syncInput(): void {
    const on = !!this.info && !this.uiPaused;
    this.input.setEnabled(on);
    this.touch.setGameplay(on);
  }

  /** Menus, the Hero Sheet and Hero Selection: freeze the solo sim and stop local prediction. */
  private get uiPaused(): boolean {
    return this.menus.open || this.sheet.isOpen || this.select.visible;
  }

  private toggleSheet(): void {
    const hero = this.myHero();
    if (!hero || this.select.visible) return;
    if (!this.sheet.isOpen) {
      if (this.menus.open) this.menus.close();
      this.audio.play('ui');
      this.sheet.render(hero, this.profile, this.myName);
      this.sheet.setVisible(true);
    } else {
      this.audio.play('uiBack');
      this.sheet.setVisible(false);
    }
    this.syncInput();
  }

  private changeHero(): void {
    if (this.lobby?.phase !== 'hub') {
      this.menus.toast('L’eroe si cambia solo in taverna.');
      return;
    }
    this.audio.play('ui');
    this.send({ t: 'reselect' });
  }

  private openHelp(): void {
    if (!this.lobby) return;
    this.menus.openHelp(this.lobby.code, !!this.conn?.offline);
  }

  private onKey(code: string): void {
    if (!this.info || !this.lobby) return;
    if (code === 'KeyM') {
      this.menus.toast(this.audio.toggleMute() ? 'Audio disattivato' : 'Audio attivo');
      return;
    }
    if (code === 'Escape') {
      if (this.sheet.isOpen) this.toggleSheet();
      else if (!this.menus.escape() && this.menus.panel === 'none') this.openHelp();
      return;
    }
    if (this.menus.open) {
      if (code === 'KeyH' && this.menus.panel === 'help') this.menus.escape();
      else if (code === 'KeyB' && this.menus.panel === 'bestiary') this.menus.escape();
      else if (code === 'KeyF' && this.menus.panel in NPCS) this.menus.escape();
      return;
    }
    if (this.select.visible) {
      if (code === 'KeyH') this.openHelp();
      else this.select.handleKey(code);
      return;
    }
    if (this.sheet.isOpen) {
      if (code === 'KeyI') this.toggleSheet();
      return;
    }
    if (code === 'KeyH') this.openHelp();
    else if (code === 'KeyB') this.menus.openBestiary();
    else if (code === 'KeyI') this.toggleSheet();
    else if (code === 'KeyC') this.changeHero();
    else if ((code === 'Digit1' || code === 'Digit2') && this.lobby.vote) {
      this.audio.play('ui');
      this.send({ t: 'vote', choice: code === 'Digit1' ? 'extract' : 'continue' });
    }
  }

  // ---------------------------------------------------------------- messages

  private onMessage(msg: ServerMsg, at: number): void {
    switch (msg.t) {
      case 'welcome':
        this.myId = msg.id;
        break;
      case 'lobby':
        this.onLobby(msg.s);
        break;
      case 'world':
        this.onWorld(msg.w);
        break;
      case 'snap':
        this.onSnapshot(msg.s, at);
        break;
      case 'mine':
        this.satchel = msg.sat;
        for (const ev of msg.ev) this.onMine(ev);
        break;
      case 'profile':
        this.profile = msg.p;
        this.menus.setProfile(msg.p);
        if (this.sheet.isOpen) {
          const hero = this.myHero();
          if (hero) this.sheet.render(hero, msg.p, this.myName);
        }
        break;
      case 'pong': {
        const ms = Math.max(0, at - msg.at);
        this.rtt = this.rtt === 0 ? ms : this.rtt * 0.7 + ms * 0.3;
        this.send({ t: 'rtt', ms: Math.round(this.rtt) });
        break;
      }
      case 'error':
        this.audio.play('deny');
        this.menus.toast(msg.text);
        break;
    }
  }

  /** Instanced loot: these events exist only for this player. */
  private onMine(ev: GameEvent): void {
    if (ev.e === 'drop') {
      this.drops.set(ev.id, { id: ev.id, kind: ev.kind, x: ev.x, z: ev.z, amount: ev.amount, age: 0 });
      const c = DROP_RGB[ev.kind];
      this.vfx.burst(ev.x, 0.7, ev.z, ev.kind === 'orb' ? 16 : 8, c, { speed: 4, life: 0.5, up: 3, gravity: 10, flat: 0.4 });
      if (ev.kind === 'orb') this.vfx.pillar(ev.x, ev.z, 0.6, GREEN, 0.7, 6);
    } else if (ev.e === 'take') {
      const drop = this.drops.get(ev.id);
      this.drops.delete(ev.id);
      this.audio.play(ev.kind === 'orb' ? 'heal' : 'ui', 0.7);
      if (ev.kind === 'orb') {
        this.hud.callout('Globo di cura · +25% Vita', 'green small');
      } else {
        this.hud.lootToast(`+${ev.amount} ${DROP_TEXT[ev.kind]}`, ev.kind);
      }
      if (drop && this.me) this.vfx.burst(this.me.x, 1.1, this.me.z, 6, DROP_RGB[ev.kind], { speed: 2, life: 0.4, up: 2, radius: 0.5, inward: true });
    }
  }

  private onLobby(lobby: LobbyState): void {
    const before = this.lobby;
    this.lobby = lobby;
    this.menus.setLobby(lobby, this.myId);
    // Whatever was reported before this player walked in is not theirs to read.
    if (!before) this.menus.skipReports();
    this.select.setLobby(lobby, this.myId);
    const hero = this.myHero();
    if (hero !== this.heroShown) {
      this.heroShown = hero;
      this.hud.setHero(hero ? HEROES[hero] : null, this.myName);
    }
    if (before) {
      for (const p of lobby.players) {
        if (!before.players.some((o) => o.id === p.id)) this.menus.toast(`${p.name} è entrato nella stanza.`);
      }
      for (const p of before.players) {
        if (!lobby.players.some((o) => o.id === p.id)) this.menus.toast(`${p.name} ha lasciato la stanza.`);
      }
      if (before.host !== lobby.host && lobby.host === this.myId) this.menus.toast('Ora sei tu a guidare la Compagnia.');
      if (!before.vote && lobby.vote) {
        this.audio.play('clear');
        this.hud.callout('Portale aperto · scegliete insieme', 'gold');
      }
    }
    if (lobby.phase !== this.lastPhase) {
      const was = this.lastPhase;
      this.lastPhase = lobby.phase;
      if (was === 'run' && lobby.phase === 'hub' && lobby.report) {
        this.audio.play(lobby.report.kind === 'wipe' ? 'defeat' : 'victory');
      }
    }
    this.syncScreens();
  }

  private clearViews(heroes: boolean): void {
    for (const e of this.enemyViews.values()) e.view.dispose();
    this.enemyViews.clear();
    for (const n of this.npcViews) n.view?.dispose();
    this.npcViews = [];
    if (heroes) {
      for (const h of this.heroViews.values()) h.view.dispose();
      this.heroViews.clear();
    } else {
      for (const h of this.heroViews.values()) {
        h.view.hasLast = false;
        h.y = Number.NaN;
      }
    }
  }

  private onWorld(info: WorldInfo): void {
    const def = info.layoutId === HUB_LAYOUT.id ? HUB_LAYOUT : layoutDefById(info.layoutId);
    if (!def) return;
    this.info = info;
    const layout = parseLayout(def);
    this.layout = layout;
    this.arena?.dispose();
    this.arena = new Arena(this.scene, this.assets, layout, this.cam.cutPlane);
    this.frames = [];
    this.hasOffset = false;
    this.me = null;
    this.pending.length = 0;
    this.outbox.length = 0;
    this.acc = 0;
    this.errX = 0;
    this.errZ = 0;
    this.lockId = 0;
    this.enemiesLite = [];
    this.poisLite = layout.pois.map((p) => ({ ...p, ready: false }));
    this.drops.clear();
    this.pings = [];
    this.flood = FLOOD_DRY;
    this.water.setEnabled(false);
    this.water.position.set(layout.center.x, 0, layout.center.z);
    this.clearViews(false);
    this.vfx.clear();
    this.radar.setLayout(layout, info.kind === 'hub');
    this.hud.clearTexts();
    this.hud.setBoss(null);
    this.hud.setVote(null);
    this.hud.breakCombo();
    if (this.menus.panel === 'title' || this.menus.panel === 'loading') this.menus.close();

    if (info.kind === 'hub') {
      this.audio.setMood('calm');
      this.npcViews = layout.npcs
        .filter((n): n is { id: NpcId; x: number; z: number } => n.id in NPC_LOOKS)
        .map((n) => ({ id: n.id, x: n.x, z: n.z, view: null }));
      this.hud.banner(info.title, info.label || 'Il rifugio della Compagnia');
    } else {
      this.audio.setMood('battle');
      if (this.menus.open && this.menus.panel !== 'help') this.menus.close();
      this.hud.banner(info.title, info.label);
    }
    // Every map runs toward +z: that is "up" on the screen until the player turns the view.
    const spawn = layout.playerSpawns[0] ?? layout.center;
    this.cam.snap(spawn.x, spawn.z, 0);
    this.syncScreens();
  }

  private onSnapshot(s: Snapshot, now: number): void {
    if (!this.info || s.w !== this.info.wid) return;
    const target = s.t - now;
    if (!this.hasOffset || Math.abs(target - this.clockOffset) > 400) {
      this.clockOffset = target;
      this.hasOffset = true;
    } else {
      this.clockOffset += (target - this.clockOffset) * 0.08;
    }
    const frame: Frame = { recv: now, s, players: new Map(), enemies: new Map() };
    for (const p of s.p) frame.players.set(p.id, p);
    for (const raw of s.e) {
      const e = unpackEnemy(raw);
      frame.enemies.set(e.id, e);
    }
    this.frames.push(frame);
    if (this.frames.length > 16) this.frames.shift();

    this.enemiesLite = [];
    for (const e of frame.enemies.values()) {
      const def = ENEMIES[e.type];
      // A crab dug into a channel cannot be struck: it is not a target at all.
      if (enemyHas(e.st, ES.Burrow)) continue;
      this.enemiesLite.push({ id: e.id, x: e.x, z: e.z, r: def.radius, alive: e.state !== EState.Dead, broken: e.state === EState.Broken });
    }
    this.alliesLite = s.p.map((p) => ({ id: p.id, x: p.x, z: p.z, downed: p.act === Act.Downed }));
    for (let i = 0; i < this.poisLite.length; i++) this.poisLite[i]!.ready = s.poi[i] === 1;
    this.flood = s.flood;

    this.reconcile(s);
    for (const ev of s.ev) this.onEvent(ev, frame);
  }

  private get stepCtx(): StepCtx {
    return { layout: this.layout!, enemies: this.enemiesLite, allies: this.alliesLite, pois: this.poisLite };
  }

  private reconcile(s: Snapshot): void {
    const sp = s.p.find((p) => p.id === this.myId);
    if (!sp) {
      this.me = null;
      this.pending.length = 0;
      return;
    }
    const ack = s.ack[this.myId] ?? 0;
    let drop = 0;
    while (drop < this.pending.length && this.pending[drop]!.seq <= ack) drop++;
    if (drop > 0) this.pending.splice(0, drop);
    const before = this.me;
    const next = clonePlayer(sp);
    const ctx = this.stepCtx;
    for (const cmd of this.pending) {
      this.scratch.length = 0;
      stepPlayer(next, cmd, ctx, this.scratch);
    }
    if (before) {
      const ex = before.x - next.x;
      const ez = before.z - next.z;
      // Small disagreements are blended away; large ones (knockback, teleports) snap.
      if (Math.hypot(ex, ez) < 2.5) {
        this.errX += ex;
        this.errZ += ez;
      } else {
        this.errX = 0;
        this.errZ = 0;
      }
    } else {
      this.cam.snap(next.x, next.z);
      this.aim = next.yaw;
    }
    this.me = next;
  }

  // ---------------------------------------------------------------- events from the server

  private nameOf(id: string): string {
    return this.lobby?.players.find((p) => p.id === id)?.name ?? '';
  }

  /** Colour of a player's effects: the hero's own, or the recolour bought from Saraya. */
  private colorOf(id: string, hero: HeroId): RGB {
    const vfxId = this.lobby?.players.find((p) => p.id === id)?.look.vfx;
    return (vfxId ? COSMETIC_BY_ID[vfxId]?.color : undefined) ?? HERO_COLOR[hero];
  }

  private slotColor(id: string): string {
    const slot = this.lobby?.players.find((p) => p.id === id)?.slot ?? 0;
    return SLOT_COLORS[slot % SLOT_COLORS.length]!;
  }

  private enemyHeight(id: number): number {
    return this.enemyViews.get(id)?.view.height ?? 2.3;
  }

  private onEvent(ev: GameEvent, frame: Frame): void {
    const vfx = this.vfx;
    const audio = this.audio;
    const mine = (id: string) => id === this.myId;
    switch (ev.e) {
      case 'hit': {
        const ev2 = this.enemyViews.get(ev.id);
        const attacker = frame.players.get(ev.by);
        const c = attacker ? this.colorOf(ev.by, attacker.hero) : WHITE;
        const h = this.enemyHeight(ev.id) * 0.55;
        const dx = attacker ? ev.x - attacker.x : 0;
        const dz = attacker ? ev.z - attacker.z : 1;
        const d = Math.hypot(dx, dz) || 1;
        const heavy = !!ev.heavy || ev.dmg >= 20 || ev.crit > 0;
        const kick = Math.min(1.6, 0.35 + (ev.kb ?? 0) * 0.12 + (heavy ? 0.25 : 0) + (ev.crit ? 0.15 : 0));
        vfx.spray(ev.x, h, ev.z, dx / d, dz / d, heavy ? 18 : 10, [1, 0.9, 0.7]);
        vfx.flash(ev.x, h, ev.z, heavy ? 1.7 : 1.05, c);
        if (kick > 0.7) vfx.shockwave(ev.x, ev.z, 1.2 + kick * 1.4, c, 0.22, kick);
        ev2?.view.hitFlash(WHITE, heavy ? 1 : 0.7);
        const at = this.project(ev.x, h + 0.9, ev.z);
        if (at) this.hud.floater(at.x, at.y, String(Math.round(ev.dmg)), `${mine(ev.by) ? 'mine' : ''} ${ev.crit ? 'crit' : ''} ${ev.crit === 3 ? 'exec' : ''}`);
        if (mine(ev.by)) {
          this.hud.hitCombo();
          audio.play(heavy ? 'hitHeavy' : 'hit');
          if (performance.now() - this.predictedHitAt > 220) this.hitStop = Math.max(this.hitStop, heavy ? 0.09 : 0.05);
          this.cam.addShake(0.18 + kick * 0.35);
          if (heavy) this.cam.addPunch(0.25 + kick * 0.2);
          if (ev.crit === 1) this.hud.callout('Colpo critico', 'gold small');
        } else {
          audio.play('hit', 0.35);
        }
        if (ev.kill) {
          audio.play('kill', mine(ev.by) ? 1 : 0.5);
          vfx.puff(ev.x, 0.8, ev.z, 10, DARK, 1, 1.8);
          vfx.burst(ev.x, 1.2, ev.z, 18, [1, 0.5, 0.2], { speed: 6, life: 0.7, up: 2.4, gravity: 4 });
          this.cam.addShake(0.35);
        }
        break;
      }
      case 'phit': {
        vfx.spray(ev.x, 1.3, ev.z, 0, 0, 12, ev.red ? RED : [1, 0.6, 0.4], 8);
        vfx.flash(ev.x, 1.3, ev.z, 1.4, ev.red ? RED : [1, 0.5, 0.3]);
        this.heroViews.get(ev.id)?.view.hitFlash(ev.red ? [1, 0.2, 0.2] : [1, 0.6, 0.6], 1);
        if (mine(ev.id)) {
          this.hud.damageFlash(ev.red);
          this.hud.breakCombo();
          audio.play(ev.red ? 'hurtRed' : 'hurt');
          this.cam.addShake(ev.red ? 0.75 : 0.45);
          this.hitStop = Math.max(this.hitStop, 0.05);
        } else {
          audio.play('hurt', 0.3);
        }
        break;
      }
      case 'block':
        vfx.spray(ev.x, 1.3, ev.z, 0, 0, 8, [0.8, 0.9, 1], 7);
        vfx.flash(ev.x, 1.3, ev.z, 0.9, [0.7, 0.85, 1]);
        audio.play('block', mine(ev.id) ? 1 : 0.4);
        if (mine(ev.id)) this.cam.addShake(0.2);
        break;
      case 'parry': {
        vfx.flash(ev.x, 1.4, ev.z, 2.6, [0.8, 0.95, 1], 0.2);
        vfx.shockwave(ev.x, ev.z, 3.2, BLUE, 0.3);
        vfx.burst(ev.x, 1.4, ev.z, 26, [0.85, 0.95, 1], { speed: 13, life: 0.4, stretch: 0.07, gravity: 8 });
        audio.play('parry', mine(ev.id) ? 1 : 0.5);
        if (mine(ev.id)) {
          this.hud.callout('Parata perfetta', 'blue');
          this.hitStop = Math.max(this.hitStop, 0.12);
          this.cam.addShake(0.5);
          this.cam.addPunch(0.6);
        }
        break;
      }
      case 'pdodge':
        vfx.shockwave(ev.x, ev.z, 2.6, GOLD, 0.35);
        vfx.burst(ev.x, 1.1, ev.z, 18, GOLD, { speed: 6, life: 0.5, flat: 0.7, stretch: 0.06 });
        audio.play('pdodge', mine(ev.id) ? 1 : 0.4);
        if (mine(ev.id)) {
          this.hud.callout('Schivata perfetta · Contrattacco!', 'gold');
          this.cam.addPunch(0.5);
        }
        break;
      case 'gbreak':
        audio.play('gbreak', mine(ev.id) ? 1 : 0.4);
        if (mine(ev.id)) {
          this.hud.callout('Guardia spezzata', 'red');
          this.cam.addShake(0.6);
        }
        break;
      case 'down':
        audio.play('down');
        if (!mine(ev.id)) this.hud.callout(`${this.nameOf(ev.id)} è a terra!`, 'red');
        break;
      case 'revive': {
        const p = frame.players.get(ev.id);
        if (p) {
          vfx.pillar(p.x, p.z, 0.8, GREEN, 0.8);
          vfx.burst(p.x, 0.4, p.z, 24, GREEN, { speed: 2, life: 1, up: 4, flat: 0.8, radius: 0.8 });
        }
        audio.play('revive');
        if (mine(ev.id)) this.hud.callout('Di nuovo in piedi', 'green');
        else if (mine(ev.by)) this.hud.callout(`Hai rialzato ${this.nameOf(ev.id)}`, 'green');
        break;
      }
      case 'heal': {
        const p = frame.players.get(ev.id);
        if (!p || ev.amt < 1) break;
        vfx.burst(p.x, 0.5, p.z, 10, GREEN, { speed: 1.2, life: 0.9, up: 3, flat: 0.8, radius: 0.6, size: 0.12 });
        const at = this.project(p.x, 2.6, p.z);
        if (at) this.hud.floater(at.x, at.y, `+${Math.round(ev.amt)}`, 'heal');
        if (mine(ev.id)) audio.play('heal');
        break;
      }
      case 'broken': {
        const e = frame.enemies.get(ev.id);
        if (!e) break;
        vfx.shockwave(e.x, e.z, 2.8, GOLD, 0.4);
        vfx.flash(e.x, this.enemyHeight(ev.id) * 0.6, e.z, 2.2, GOLD, 0.2);
        this.enemyViews.get(ev.id)?.view.hitFlash(GOLD, 1.2);
        audio.play('broken');
        break;
      }
      case 'exec': {
        const e = frame.enemies.get(ev.id);
        if (!e) break;
        const h = this.enemyHeight(ev.id) * 0.55;
        vfx.flash(e.x, h, e.z, 3.4, WHITE, 0.22);
        vfx.burst(e.x, h, e.z, 40, [1, 0.85, 0.5], { speed: 15, life: 0.5, stretch: 0.07, gravity: 10 });
        vfx.shockwave(e.x, e.z, 4.5, WHITE, 0.4);
        audio.play('exec', mine(ev.by) ? 1 : 0.5);
        if (mine(ev.by)) {
          this.hud.callout('Esecuzione', 'gold');
          this.hitStop = Math.max(this.hitStop, 0.14);
          this.cam.addShake(0.7);
          this.cam.addPunch(1);
        }
        break;
      }
      case 'spawn': {
        const e = frame.enemies.get(ev.id);
        if (!e) break;
        vfx.puff(e.x, 0.2, e.z, 7, DARK, 0.9, 2.2, 1.1);
        vfx.implode(e.x, e.z, 2.2, VIOLET, 0.5);
        audio.play('spawn', 0.6);
        break;
      }
      case 'cast':
        this.onCast(ev, frame);
        break;
      case 'ecast':
        switch (ev.what) {
          case 'drum':
            audio.play('drum');
            this.cam.addShake(0.7);
            vfx.flash(ev.x, 2.5, ev.z, 5, RED, 0.25);
            break;
          case 'silence':
            audio.play('silence');
            vfx.pillar(ev.x, ev.z, 1.6, VIOLET, 0.8, 9);
            break;
          case 'summon':
            audio.play('roar', 0.6);
            vfx.shockwave(ev.x, ev.z, ev.r + 2, VIOLET, 0.6);
            break;
          case 'slam':
            audio.play('slam', Math.min(1, 0.5 + ev.r * 0.1));
            vfx.shockwave(ev.x, ev.z, ev.r, RED, 0.4);
            vfx.puff(ev.x, 0.2, ev.z, Math.round(6 + ev.r * 2), [0.4, 0.3, 0.3], ev.r * 0.8, 1.4);
            vfx.burst(ev.x, 0.3, ev.z, Math.round(10 + ev.r * 4), [1, 0.5, 0.25], { speed: 9, life: 0.5, up: 5, gravity: 14, stretch: 0.06, flat: 0.6 });
            this.shakeNear(ev.x, ev.z, 0.3 + ev.r * 0.1);
            break;
          case 'roar':
            audio.play('roar');
            vfx.shockwave(ev.x, ev.z, ev.r, RED, 0.7);
            this.cam.addShake(0.9);
            break;
          default:
            this.onFx(ev.what, ev.x, ev.z, ev.r);
            break;
        }
        break;
      case 'fx':
        this.onFx(ev.what, ev.x, ev.z, ev.r);
        break;
      case 'slam': {
        const power = Math.min(1.8, ev.power / 8);
        vfx.shockwave(ev.x, ev.z, 2.2 + power * 1.5, [0.85, 0.75, 0.55], 0.35, power);
        vfx.puff(ev.x, 0.25, ev.z, Math.round(8 + power * 8), [0.45, 0.38, 0.32], 1.2 + power, 1.6);
        vfx.burst(ev.x, 0.8, ev.z, Math.round(14 + power * 12), [1, 0.85, 0.55], {
          speed: 7 + power * 4,
          life: 0.45,
          up: 3 + power * 2,
          gravity: 12,
          stretch: 0.06,
          flat: 0.5,
        });
        audio.play('slam', Math.min(1, 0.45 + power * 0.35));
        this.shakeNear(ev.x, ev.z, 0.45 + power * 0.4);
        this.cam.addPunch(0.2 + power * 0.25);
        break;
      }
      case 'smash': {
        this.arena?.smashAt(ev.x, ev.z);
        const wood: [number, number, number] = ev.kind === 'crates' ? [0.55, 0.38, 0.22] : [0.4, 0.28, 0.18];
        vfx.burst(ev.x, 0.9, ev.z, 28, wood, { speed: 9, life: 0.7, up: 5, gravity: 14, stretch: 0.07 });
        vfx.burst(ev.x, 0.5, ev.z, 16, [0.75, 0.65, 0.45], { speed: 6, life: 0.55, up: 2.5, gravity: 10, flat: 0.7 });
        vfx.puff(ev.x, 0.4, ev.z, 10, wood, 1.4, 1.8);
        vfx.shockwave(ev.x, ev.z, 2.8, wood, 0.3);
        audio.play('slam', 0.85);
        this.shakeNear(ev.x, ev.z, 0.55);
        if (this.me && Math.hypot(ev.x - this.me.x, ev.z - this.me.z) < 10) {
          this.hud.callout(ev.kind === 'crates' ? 'Casse in frantumi' : 'Barile in pezzi', 'gold small');
        }
        break;
      }
      case 'clear':
        audio.play('clear');
        this.hud.callout(this.layout?.pois.some((p) => p.kind === 'portal') ? 'Mini-Boss abbattuto · il Portale si apre' : 'Boss abbattuto', 'green');
        break;
      case 'say':
        this.hud.say(ev.who, ev.text);
        break;
      case 'taunt': {
        const live = this.blades.some((b) => b.text === ev.text);
        if (!live) {
          for (let i = this.blades.length - 1; i >= 0; i--) {
            if (this.blades[i]!.id === ev.id) this.blades.splice(i, 1);
          }
          this.blades.push({ id: ev.id, who: ev.who, text: ev.text, until: performance.now() + 7500 });
          if (this.blades.length > 2) this.blades.shift();
        }
        break;
      }
      case 'hint':
        // Tutorial and strategy notes stay off the screen. Only enemy taunts are shown.
        break;
      case 'phase': {
        let name = '';
        for (const e of frame.enemies.values()) if (ENEMIES[e.type].bar && e.state !== EState.Dead) name = ENEMIES[e.type].name;
        this.hud.banner(name || 'Il boss cambia fase', ev.n >= 2 ? 'Ultima fase' : 'Seconda fase', 2.6);
        audio.play('roar', 0.8);
        this.cam.addShake(0.6);
        break;
      }
      case 'poi': {
        const poi = this.layout?.pois.find((p) => p.id === ev.id);
        if (!poi) break;
        if (ev.state === 1 && ev.kind === 'portal') {
          vfx.pillar(poi.x, poi.z, 2.2, VIOLET, 1.2, 12);
          vfx.shockwave(poi.x, poi.z, 6, VIOLET, 0.8);
        } else if (ev.state === 2 && ev.kind === 'chest') {
          vfx.shockwave(poi.x, poi.z, 9, GOLD, 0.8, 1.3);
          vfx.pillar(poi.x, poi.z, 1.6, GOLD, 1, 12);
          vfx.burst(poi.x, 1.2, poi.z, 60, GOLD, { speed: 9, life: 1, up: 5, gravity: 9, stretch: 0.05 });
          audio.play('victory', 0.7);
          this.shakeNear(poi.x, poi.z, 0.4);
        } else if (ev.state === 2 && ev.kind === 'shrine') {
          vfx.pillar(poi.x, poi.z, 2, GREEN, 1.1, 10);
          vfx.shockwave(poi.x, poi.z, TUNING.shrineRadius, GREEN, 0.7);
          audio.play('heal');
          this.hud.callout(mine(ev.by) ? 'Santuario di Cura attivato' : `${this.nameOf(ev.by)} attiva il Santuario di Cura`, 'green small');
        }
        break;
      }
      case 'synergy': {
        const buff = synergyInfo(ev.buff);
        this.hud.banner(`Sinergia · ${buff.name}`, `${buff.text} — aperto da ${this.nameOf(ev.by) || 'un eroe'}`, 3.4);
        break;
      }
      case 'fury': {
        const p = frame.players.get(ev.id);
        if (p) vfx.shockwave(p.x, p.z, 2.4 + ev.tier * 0.5, EMBER, 0.4);
        if (mine(ev.id)) {
          const text = ['', 'Slancio I · +20% velocità d’attacco', 'Slancio II · +15% critico', 'Slancio III · vigore inesauribile', 'Slancio IV · aura vampirica'][ev.tier];
          if (text) this.hud.callout(text, 'gold');
          audio.play('chargeFull');
        }
        break;
      }
      case 'hook':
        vfx.flash(ev.x, 1.2, ev.z, 2, [0.8, 0.85, 0.9]);
        vfx.shockwave(ev.x, ev.z, 3, [0.8, 0.85, 0.9], 0.35);
        audio.play('gbreak', mine(ev.id) ? 1 : 0.5);
        if (mine(ev.id)) {
          this.hud.callout('Arpionato · trascinato a quota 0', 'red');
          this.cam.addShake(0.7);
        }
        break;
      case 'flood':
        if (ev.level > FLOOD_DRY) {
          this.hud.banner('L’acqua tossica sale', ev.level >= 0 ? 'Quota 0 sommersa: restano solo le piattaforme' : 'Le conche sono sommerse: restate in alto', 3.4);
          audio.play('roar');
          this.cam.addShake(0.9);
        }
        break;
      case 'immune': {
        const e = frame.enemies.get(ev.id);
        if (!e) break;
        const at = this.project(e.x, this.enemyHeight(ev.id) * 0.9, e.z);
        if (at) this.hud.floater(at.x, at.y, 'Immune', 'poise');
        break;
      }
      case 'ping': {
        this.pings.push({ by: ev.by, kind: ev.kind, x: ev.x, z: ev.z, age: 0 });
        if (this.pings.length > 12) this.pings.shift();
        vfx.pillar(ev.x, ev.z, 0.5, PING_RGB[ev.kind], 0.6, 8);
        vfx.shockwave(ev.x, ev.z, 3, PING_RGB[ev.kind], 0.5);
        audio.play(ev.kind === 'danger' || ev.kind === 'elite' ? 'warnRed' : 'ui', 0.8);
        break;
      }
      case 'poise': {
        const at = this.project(ev.x, this.enemyHeight(ev.id) * 0.7, ev.z);
        if (at) this.hud.floater(at.x, at.y, String(ev.dmg), 'poise');
        break;
      }
    }
  }

  private shakeNear(x: number, z: number, amount: number): void {
    if (!this.me) return;
    const d = Math.hypot(x - this.me.x, z - this.me.z);
    this.cam.addShake(amount * Math.max(0, 1 - d / 28));
  }

  private onFx(what: string, x: number, z: number, r: number): void {
    const vfx = this.vfx;
    if (what.startsWith('pop_')) {
      const c = PROJ_COLOR[what.slice(4)] ?? WHITE;
      vfx.flash(x, 1.2, z, 0.9 + r * 0.5, c);
      vfx.burst(x, 1.2, z, 8 + Math.round(r * 5), c, { speed: 4 + r * 2, life: 0.35, stretch: 0.05 });
      if (r > 1) {
        vfx.shockwave(x, z, r, c, 0.3);
        this.audio.play('pop');
      }
      return;
    }
    switch (what) {
      case 'slam':
        vfx.shockwave(x, z, r, WHITE, 0.35);
        vfx.puff(x, 0.2, z, 6, [0.5, 0.45, 0.4], r * 0.7, 1.2);
        vfx.burst(x, 0.3, z, 16, [1, 0.8, 0.5], { speed: 8, life: 0.45, up: 4, gravity: 14, stretch: 0.06, flat: 0.6 });
        this.audio.play('slam', 0.7);
        this.shakeNear(x, z, 0.5);
        break;
      case 'bolt':
        vfx.bolt(x, z, [0.8, 0.6, 1]);
        this.audio.play('bolt');
        break;
      case 'vanish':
        vfx.puff(x, 0.6, z, 6, DARK, 0.5, 1.5);
        vfx.implode(x, z, 1.8, VIOLET, 0.25);
        break;
      case 'appear':
        vfx.puff(x, 0.6, z, 6, DARK, 0.5, 1.5);
        vfx.shockwave(x, z, 2, VIOLET, 0.3);
        break;
      case 'collapse':
        vfx.flash(x, 1.5, z, r * 1.2, VIOLET, 0.3);
        vfx.shockwave(x, z, r * 1.3, VIOLET, 0.5);
        vfx.burst(x, 1.5, z, 50, [0.8, 0.4, 1], { speed: 16, life: 0.7, stretch: 0.07 });
        this.audio.play('slam');
        this.shakeNear(x, z, 0.9);
        break;
      case 'implode':
        vfx.flash(x, 1.2, z, r * 0.6, VIOLET);
        vfx.shockwave(x, z, r * 0.8, VIOLET, 0.3);
        this.audio.play('pop');
        break;
      case 'burst':
        vfx.flash(x, 1, z, r * 1.3, RED, 0.2);
        vfx.shockwave(x, z, r, RED, 0.35);
        vfx.burst(x, 0.8, z, 26, [1, 0.3, 0.2], { speed: 10, life: 0.5, stretch: 0.06, gravity: 6 });
        this.audio.play('pop');
        this.shakeNear(x, z, 0.4);
        break;
      case 'clash':
        vfx.flash(x, 1.2, z, 1.6, WHITE, 0.15);
        vfx.shockwave(x, z, r + 0.8, [0.95, 0.85, 0.55], 0.25);
        vfx.burst(x, 1.1, z, 18, [1, 0.9, 0.6], { speed: 8, life: 0.4, stretch: 0.05, gravity: 8 });
        this.audio.play('hitHeavy', 0.55);
        this.shakeNear(x, z, 0.35);
        break;
      case 'elusion':
        vfx.puff(x, 0.7, z, 5, [0.7, 0.45, 0.95], 0.55, 1.4);
        vfx.implode(x, z, 1.4, VIOLET, 0.2);
        this.audio.play('pdodge', 0.45);
        break;
      case 'spores':
        vfx.shockwave(x, z, r, TOXIC, 0.6);
        vfx.puff(x, 0.6, z, Math.round(8 + r * 2), [0.35, 0.6, 0.2], r * 0.7, 1, 1.4, 1.2);
        vfx.burst(x, 1, z, 24, TOXIC, { speed: 5, life: 0.9, up: 2, drag: 1.5 });
        this.audio.play('pop', 0.7);
        break;
      case 'emerge':
        vfx.puff(x, 0.2, z, 10, [0.45, 0.4, 0.35], 1.2, 1.6);
        vfx.burst(x, 0.3, z, 20, [0.7, 0.65, 0.55], { speed: 8, life: 0.5, up: 5, gravity: 14, flat: 0.5 });
        vfx.shockwave(x, z, Math.max(2.4, r), [0.8, 0.7, 0.5], 0.35);
        this.audio.play('slam', 0.7);
        this.shakeNear(x, z, 0.4);
        break;
      case 'clang':
        vfx.flash(x, 1.3, z, 1.2, [0.8, 0.9, 1], 0.12);
        vfx.burst(x, 1.3, z, 12, [0.85, 0.92, 1], { speed: 9, life: 0.3, stretch: 0.06, gravity: 8 });
        this.audio.play('block', 0.7);
        break;
      case 'reflect':
        vfx.flash(x, 1.3, z, 1.4, ICE, 0.16);
        vfx.shockwave(x, z, 2, ICE, 0.25);
        this.audio.play('parry', 0.5);
        break;
      case 'shock':
        vfx.shockwave(x, z, r, RED, 0.5, 1.5);
        vfx.shockwave(x, z, r * 0.6, [1, 0.6, 0.3], 0.4);
        vfx.burst(x, 0.5, z, 50, [1, 0.4, 0.2], { speed: 16, life: 0.5, flat: 0.8, stretch: 0.06 });
        this.audio.play('slam');
        this.shakeNear(x, z, 1);
        break;
      case 'trail_chaos':
        vfx.flash(x, 1.1, z, r * 0.7, VIOLET, 0.22);
        vfx.shockwave(x, z, r, VIOLET, 0.3);
        vfx.burst(x, 0.9, z, 18, [0.75, 0.35, 1], { speed: 7, life: 0.4, stretch: 0.05, gravity: 8 });
        this.audio.play('pop', 0.55);
        break;
    }
  }

  private onCast(ev: Extract<GameEvent, { e: 'cast' }>, frame: Frame): void {
    const vfx = this.vfx;
    const p = frame.players.get(ev.id);
    const px = p ? p.x : ev.x;
    const pz = p ? p.z : ev.z;
    const c = p ? this.colorOf(ev.id, p.hero) : WHITE;
    const ult = p ? HEROES[p.hero].ult.id === ev.what : false;
    this.audio.play(ult ? 'ult' : 'ability', ev.id === this.myId ? 1 : 0.5);
    if (ult) {
      this.hud.callout(`${p ? HEROES[p.hero].short : ''} · ${p ? HEROES[p.hero].ult.name : ''}`, 'ult');
      vfx.pillar(px, pz, 1.2, c, 0.7, 10);
      this.shakeNear(px, pz, 0.5);
    }
    switch (ev.what) {
      case 'ocarina':
        vfx.shockwave(ev.x, ev.z, ev.r, VIOLET, 0.6);
        vfx.burst(ev.x, 1.6, ev.z, 30, [0.8, 0.5, 1], { speed: 7, life: 0.9, flat: 0.8, drag: 1.5 });
        break;
      case 'canto':
        vfx.shockwave(ev.x, ev.z, ev.r, GREEN, 0.7);
        vfx.burst(ev.x, 0.3, ev.z, 36, [0.6, 1, 0.7], { speed: 1.5, life: 1.2, up: 3.5, flat: 0.9, radius: ev.r * 0.6 });
        break;
      case 'balzo':
        vfx.shockwave(ev.x, ev.z, ev.r + 0.6, c, 0.35);
        vfx.puff(ev.x, 0.2, ev.z, 8, [0.45, 0.35, 0.3], 1.6, 1.2);
        this.audio.play('slam', 0.6);
        this.shakeNear(ev.x, ev.z, 0.5);
        break;
      case 'provocazione':
        vfx.shockwave(ev.x, ev.z, ev.r, ICE, 0.6);
        vfx.shockwave(ev.x, ev.z, ev.r * 0.6, ICE, 0.45);
        this.audio.play('roar', 0.5);
        break;
      case 'marchio':
        vfx.implode(ev.x, ev.z, ev.r, RED, 0.35);
        vfx.pillar(ev.x, ev.z, 0.5, RED, 0.5, 8);
        break;
      case 'gelo': {
        const fx = Math.sin(ev.yaw);
        const fz = Math.cos(ev.yaw);
        for (let i = 0; i < 46; i++) {
          const a = ev.yaw + (Math.random() - 0.5) * 1.5;
          const d = 1 + Math.random() * 2;
          vfx.spray(ev.x + fx * d, 0.6 + Math.random() * 1.4, ev.z + fz * d, Math.sin(a), Math.cos(a), 1, ICE, 16, 0.5);
        }
        vfx.shockwave(ev.x + fx * 4, ev.z + fz * 4, 4.5, ICE, 0.5);
        break;
      }
      case 'bolla':
        vfx.shockwave(ev.x, ev.z, ev.r, GOLD, 0.6);
        break;
      case 'ondata_0':
        vfx.shockwave(ev.x, ev.z, 6, VIOLET, 0.45);
        vfx.burst(ev.x, 1.2, ev.z, 40, VIOLET, { speed: 13, life: 0.5, stretch: 0.07 });
        this.shakeNear(ev.x, ev.z, 0.5);
        break;
      case 'ondata_1':
        vfx.shockwave(ev.x, ev.z, 3, [0.8, 0.6, 1], 0.3);
        break;
      case 'ondata_2':
        vfx.shockwave(ev.x, ev.z, 7, ICE, 0.5);
        vfx.burst(ev.x, 0.8, ev.z, 36, ICE, { speed: 10, life: 0.6, flat: 0.8, stretch: 0.05 });
        break;
      case 'ondata_3':
        vfx.shockwave(ev.x, ev.z, 10, GREEN, 0.7);
        break;
      case 'ondata_4':
        vfx.shockwave(ev.x, ev.z, 8, [1, 0.3, 0.8], 0.5);
        vfx.burst(ev.x, 1.2, ev.z, 40, [1, 0.4, 0.9], { speed: 9, life: 0.8, drag: 1 });
        break;
      case 'ombra':
        vfx.puff(ev.x, 0.6, ev.z, 12, DARK, 1, 1.6);
        break;
      case 'ballata':
        vfx.shockwave(ev.x, ev.z, ev.r, GOLD, 0.9);
        vfx.shockwave(ev.x, ev.z, ev.r * 0.5, [0.5, 0.85, 1], 0.7);
        vfx.burst(ev.x, 0.4, ev.z, 60, GOLD, { speed: 2, life: 1.4, up: 4, flat: 0.9, radius: ev.r * 0.5 });
        break;
      case 'licantropo':
        vfx.shockwave(ev.x, ev.z, ev.r, RED, 0.5);
        vfx.burst(ev.x, 1.2, ev.z, 30, [1, 0.3, 0.2], { speed: 8, life: 0.6, stretch: 0.06 });
        this.audio.play('roar', 0.8);
        break;
      case 'sisma':
        vfx.shockwave(ev.x, ev.z, ev.r, ICE, 0.55, 1.4);
        vfx.shockwave(ev.x, ev.z, ev.r * 0.6, WHITE, 0.4);
        vfx.puff(ev.x, 0.2, ev.z, 18, [0.5, 0.5, 0.5], ev.r * 0.6, 1.4);
        vfx.burst(ev.x, 0.3, ev.z, 50, [0.8, 0.95, 1], { speed: 14, life: 0.6, up: 6, gravity: 16, stretch: 0.06, flat: 0.7 });
        this.audio.play('slam');
        this.shakeNear(ev.x, ev.z, 1.1);
        break;
      case 'pioggia':
        vfx.implode(ev.x, ev.z, ev.r, [0.8, 0.9, 1], 0.4);
        break;
      case 'furia':
        vfx.shockwave(ev.x, ev.z, ev.r, [0.2, 1, 0.8], 0.5);
        vfx.burst(ev.x, 1.2, ev.z, 30, [0.3, 1, 0.85], { speed: 8, life: 0.6, stretch: 0.06 });
        this.audio.play('roar', 0.6);
        break;
      case 'chiavistello':
        vfx.shockwave(ev.x, ev.z, ev.r, GOLD, 0.8, 1.4);
        vfx.shockwave(ev.x, ev.z, ev.r * 0.55, WHITE, 0.6);
        vfx.pillar(ev.x, ev.z, 2.2, GOLD, 0.9, 14);
        vfx.burst(ev.x, 1.5, ev.z, 70, GOLD, { speed: 14, life: 0.9, stretch: 0.06 });
        this.shakeNear(ev.x, ev.z, 0.8);
        break;
      case 'collasso':
        vfx.implode(ev.x, ev.z, ev.r, VIOLET, 0.5);
        break;
      case 'danza':
        vfx.shockwave(ev.x, ev.z, ev.r, c, 0.7);
        vfx.burst(ev.x, 1.2, ev.z, 36, [0.85, 0.15, 0.32], { speed: 6, life: 0.9, flat: 0.85, drag: 1.2 });
        vfx.burst(ev.x, 0.4, ev.z, 22, [1, 0.72, 0.4], { speed: 2, life: 1.1, up: 3.2, flat: 0.9, radius: ev.r * 0.4 });
        break;
      case 'spirale':
        vfx.shockwave(ev.x, ev.z, ev.r, c, 0.55, 1.2);
        vfx.shockwave(ev.x, ev.z, ev.r * 0.55, [1, 0.78, 0.42], 0.45);
        vfx.burst(ev.x, 1.1, ev.z, 52, [0.8, 0.12, 0.26], { speed: 11, life: 0.7, stretch: 0.06, flat: 0.55 });
        this.shakeNear(ev.x, ev.z, 0.45);
        break;
    }
  }

  // ---------------------------------------------------------------- frame

  /** Screen position (CSS pixels) of a point `y` above the floor, or null when it is off the screen. */
  private project(x: number, y: number, z: number): { x: number; y: number } | null {
    y += this.groundY(x, z);
    const m = this.viewProj.m;
    const w = x * m[3]! + y * m[7]! + z * m[11]! + m[15]!;
    if (w <= 0.05) return null;
    const cx = (x * m[0]! + y * m[4]! + z * m[8]! + m[12]!) / w;
    const cy = (x * m[1]! + y * m[5]! + z * m[9]! + m[13]!) / w;
    if (cx < -1.2 || cx > 1.2 || cy < -1.2 || cy > 1.2) return null;
    return { x: (cx * 0.5 + 0.5) * this.canvas.clientWidth, y: (0.5 - cy * 0.5) * this.canvas.clientHeight };
  }

  /**
   * Draws a marker for a world point: `onScreen` when it is in view, otherwise an arrow
   * pinned to the edge of the screen pointing toward it.
   */
  private pointAt(id: string, x: number, y: number, z: number, color: string, text: string, cls: string): { x: number; y: number } | null {
    y += this.groundY(x, z);
    const m = this.viewProj.m;
    const w = x * m[3]! + y * m[7]! + z * m[11]! + m[15]!;
    const sign = w < 0 ? -1 : 1;
    const d = Math.max(0.05, Math.abs(w));
    const cx = ((x * m[0]! + y * m[4]! + z * m[8]! + m[12]!) / d) * sign;
    const cy = ((x * m[1]! + y * m[5]! + z * m[9]! + m[13]!) / d) * sign;
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    if (w > 0.05 && Math.abs(cx) < 0.94 && Math.abs(cy) < 0.9) {
      return { x: (cx * 0.5 + 0.5) * W, y: (0.5 - cy * 0.5) * H };
    }
    const k = 1 / Math.max(Math.abs(cx) / 0.9, Math.abs(cy) / 0.84, 1e-6);
    const ex = (cx * k * 0.5 + 0.5) * W;
    const ey = (0.5 - cy * k * 0.5) * H;
    this.hud.pointer(id, ex, ey, Math.atan2(cx * W, cy * H), color, text, cls);
    return null;
  }

  frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, this.lastFrame ? (now - this.lastFrame) / 1000 : 1 / 60);
    this.lastFrame = now;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;

    const paused = this.uiPaused;
    const conn = this.conn;
    if (conn) {
      // Pause only after we have a live world — keep lobby/welcome flowing while menus show.
      // Edge-trigger: the solo host resets its clock on resume.
      const freezeHost = paused && !!this.info;
      if (freezeHost !== this.hostFreeze) {
        this.hostFreeze = freezeHost;
        conn.setPaused?.(freezeHost, now);
      }
      if (now - this.lastPing > 2000) {
        this.lastPing = now;
        this.send({ t: 'ping', at: now });
      }
      conn.update(now);
    }

    // The hero stage takes the whole screen for Hero Selection and behind the Hero Sheet.
    const stageOn = !!this.info && (this.select.visible || this.sheet.isOpen);
    if (stageOn) {
      const hero = this.select.visible ? this.select.shown : this.myHero() || this.select.shown;
      const look = loadoutOf(this.profile, hero);
      const pose = this.select.visible && look.pose ? COSMETIC_BY_ID[look.pose]?.clip : undefined;
      const wide = this.canvas.clientWidth > 900;
      this.stage.show(hero, look, pose ?? 'Idle', this.sheet.isOpen && wide ? 1.55 : 0);
      this.stage.update(dt);
    }
    if (stageOn !== this.stageOn) {
      this.stageOn = stageOn;
      this.scene.activeCamera = stageOn ? this.stage.camera : this.cam.camera;
    }
    this.hud.setVisible(!!this.info && !stageOn);

    if (this.info && this.layout && this.conn) {
      const input = this.input.poll(dt);
      if (!paused) this.simulate(dt, input);
      else this.acc = 0;
      if (!paused && this.hitStop > 0) this.hitStop -= dt;
      if (!stageOn) this.render(dt, now);
    }

    if (!paused) this.arena?.update(dt);
    this.audio.update(dt);
    this.hud.update(dt);
    if (!paused) this.vfx.update(dt, this.cam);
    this.scene.render();
  }

  private simulate(dt: number, input: InputFrame): void {
    const me = this.me;
    this.cam.rotate(input.lookX);
    if (input.zoom) this.cam.zoom(input.zoom);
    if (!me) {
      this.acc = 0;
      return;
    }
    this.updateLock(input, me);

    // Screen-space movement: "up" on the stick or W is always the top of the screen.
    const { x: mx, z: mz } = screenToWorld(input.moveX, input.moveY, this.cam.yaw, this.moveDir);

    // Aim: the cursor on the ground with a mouse, the way the hero is heading otherwise.
    let aimed = false;
    if (input.mouseAim && this.cam.groundPoint(input.mouseU, input.mouseV, this.meFeet + 1, this.aimAt)) {
      const dx = this.aimAt.x - me.x;
      const dz = this.aimAt.z - me.z;
      if (Math.hypot(dx, dz) > 0.35) this.aim = yawOf(dx, dz);
      aimed = true;
    } else if (Math.hypot(mx, mz) > 0.2) {
      this.aim = yawOf(mx, mz);
    } else {
      this.aim = me.yaw;
    }

    if (input.ping) {
      if (aimed) this.ping(this.aimAt.x, this.aimAt.z);
      else this.ping(me.x + Math.sin(this.aim) * 3, me.z + Math.cos(this.aim) * 3);
    }

    if (input.buttons & Btn.Interact && !(this.prevButtons & Btn.Interact) && this.info!.kind === 'hub') {
      const npc = this.nearNpc(me);
      if (npc) {
        this.audio.play('ui');
        this.menus.openNpc(npc);
      }
    }
    this.prevButtons = input.buttons;

    this.acc = Math.min(this.acc + dt, DT * 8);
    const ctx = this.stepCtx;
    while (this.acc >= DT) {
      this.acc -= DT;
      const cmd = quantizeCmd({ seq: ++this.seq, mx, mz, buttons: input.buttons, aim: this.aim, lock: this.lockId });
      this.events.length = 0;
      stepPlayer(me, cmd, ctx, this.events);
      this.pending.push(cmd);
      this.outbox.push(cmd);
      for (const ev of this.events) this.onPredicted(ev, me);
    }
    if (this.pending.length > 180) this.pending.splice(0, this.pending.length - 180);
    if (this.outbox.length > 0) {
      this.send({ t: 'i', c: packCmds(this.outbox), v: this.shownClock });
      this.outbox.length = 0;
    }
  }

  /** The NPC (or the Map Table) close enough to talk to. */
  private nearNpc(me: PlayerState): NpcId | null {
    const layout = this.layout;
    if (!layout || this.info?.kind !== 'hub') return null;
    let best: NpcId | null = null;
    let bestD: number = TUNING.interactRange + 1.6;
    for (const n of this.npcViews) {
      const d = Math.hypot(n.x - me.x, n.z - me.z);
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    const t = layout.table;
    if (t && Math.hypot(t.x - me.x, t.z - me.z) < Math.min(bestD, TUNING.interactRange + 2.4)) best = 'tavolo';
    return best;
  }

  /** Marks a spot for the whole company. What it means is read from what is there. */
  private ping(x: number, z: number): void {
    const latest = this.frames[this.frames.length - 1];
    let kind: PingKind = 'rally';
    const layout = this.layout;
    if (layout && latest) {
      layout.pois.forEach((poi, i) => {
        if (poi.kind === 'chest' && latest.s.poi[i] !== 2 && Math.hypot(poi.x - x, poi.z - z) < 4.5) kind = 'chest';
      });
      if (kind === 'rally') {
        let bestD = 4.5;
        for (const e of latest.enemies.values()) {
          if (e.state === EState.Dead || enemyHas(e.st, ES.Burrow)) continue;
          const def = ENEMIES[e.type];
          if (def.dummy) continue;
          const d = Math.hypot(e.x - x, e.z - z) - def.radius;
          if (d < bestD) {
            bestD = d;
            kind = def.rank === 'base' ? 'danger' : 'elite';
          }
        }
      }
    }
    this.send({ t: 'mark', kind, x, z });
  }

  /** Immediate feedback for things the local hero just did, before the server confirms them. */
  private onPredicted(ev: PlayerEvent, me: PlayerState): void {
    switch (ev.type) {
      case 'melee': {
        const def = ev.heavy ? HEROES[me.hero].heavy : HEROES[me.hero].light[ev.idx]!;
        if (this.wouldHit(me, def)) {
          this.predictedHitAt = performance.now();
          this.hitStop = Math.max(this.hitStop, ev.heavy ? 0.085 : 0.05);
        }
        break;
      }
      case 'fail':
        this.audio.play('deny');
        this.hud.callout(FAIL_TEXT[ev.why] ?? '', 'small');
        break;
      case 'charge':
        this.audio.play('charge');
        break;
      case 'execStart':
        this.cam.addPunch(0.5);
        break;
    }
  }

  private wouldHit(me: PlayerState, def: AttackDef): boolean {
    const half = (def.arc * Math.PI) / 360;
    for (const e of this.enemiesLite) {
      if (!e.alive) continue;
      const dx = e.x - me.x;
      const dz = e.z - me.z;
      const d = Math.hypot(dx, dz) - e.r;
      if (d > def.range + TUNING.lagPad) continue;
      if (def.arc >= 360 || d < 0.8 || Math.abs(angleDiff(yawOf(dx, dz), me.yaw)) <= half) return true;
    }
    return false;
  }

  private updateLock(input: InputFrame, me: PlayerState): void {
    const latest = this.frames[this.frames.length - 1];
    if (!latest) return;
    const usable = (e: EnemySnap | undefined): e is EnemySnap =>
      !!e && e.state !== EState.Dead && !enemyHas(e.st, ES.Burrow) && Math.hypot(e.x - me.x, e.z - me.z) < 42;
    const candidates = (): EnemySnap[] => {
      const out: EnemySnap[] = [];
      for (const e of latest.enemies.values()) {
        if (!usable(e)) continue;
        if (Math.hypot(e.x - me.x, e.z - me.z) > 34) continue;
        if (!losClear(this.layout!, me.x, me.z, e.x, e.z, standElevation(this.layout!, me.x, me.z))) continue;
        out.push(e);
      }
      return out;
    };

    if (this.lockId && !usable(latest.enemies.get(this.lockId))) {
      // The target fell: move on to the closest threat instead of dropping the lock mid-fight.
      let best = 0;
      let bestD = 18;
      for (const e of candidates()) {
        const d = Math.hypot(e.x - me.x, e.z - me.z);
        if (d < bestD) {
          bestD = d;
          best = e.id;
        }
      }
      this.lockId = best;
    }
    if (!input.lockToggle) return;
    if (this.lockId) {
      this.lockId = 0;
      return;
    }
    // Lock onto whatever the hero is aiming at, nearest first.
    let best = 0;
    let bestScore = Infinity;
    for (const e of candidates()) {
      const score = Math.abs(angleDiff(yawOf(e.x - me.x, e.z - me.z), this.aim)) * 9 + Math.hypot(e.x - me.x, e.z - me.z) * 0.45;
      if (score < bestScore) {
        bestScore = score;
        best = e.id;
      }
    }
    this.lockId = best;
    this.audio.play(best ? 'ui' : 'deny');
  }

  // ---------------------------------------------------------------- rendering

  private heroView(id: string, hero: HeroId): HeroView {
    const look = this.lobby?.players.find((p) => p.id === id)?.look;
    const key = lookKey(hero, look);
    let hv = this.heroViews.get(id);
    if (hv && hv.key !== key) {
      hv.view.dispose();
      hv = undefined;
    }
    if (!hv) {
      const view = new CharacterView(this.scene, this.assets, dressHero(hero, look), `hero:${id}`, this.shadow);
      hv = { view, hero, key, act: Act.Idle, combo: 0, t: 0, x: 0, z: 0, yaw: 0, y: Number.NaN, fullCharge: false, wolf: false, seen: true };
      this.heroViews.set(id, hv);
    }
    hv.seen = true;
    return hv;
  }

  private render(dt: number, now: number): void {
    const vfx = this.vfx;
    const hud = this.hud;
    const layout = this.layout!;
    const latest = this.frames[this.frames.length - 1];
    const frozen = this.hitStop > 0;

    // Pick the two snapshots around the render time.
    const rt = now + this.clockOffset - (this.conn?.offline ? 60 : INTERP_DELAY_MS);
    let a = latest;
    let b = latest;
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i]!;
      if (f.s.t <= rt) {
        a = f;
        b = this.frames[i + 1] ?? f;
        break;
      }
      a = f;
      b = f;
    }
    this.shownClock = latest && a ? Math.round(Math.min(latest.s.t, Math.max(a.s.t, rt))) : 0;
    const span = a && b ? b.s.t - a.s.t : 0;
    const u = span > 0 ? Math.min(1, Math.max(0, (rt - a!.s.t) / span)) : 0;
    const since = a ? Math.max(0, Math.min(0.25, (rt - a.s.t) / 1000)) : 0;

    for (const h of this.heroViews.values()) h.seen = false;
    for (const e of this.enemyViews.values()) e.seen = false;
    hud.beginFrame();

    const blend = Math.exp(-dt * 14);
    this.errX *= blend;
    this.errZ *= blend;
    const me = this.me;
    const meX = me ? me.x + this.errX : layout.center.x;
    const meZ = me ? me.z + this.errZ : layout.center.z;
    this.meFeet = this.rawGroundY(meX, meZ, this.meFeet);

    // ---- camera first, so everything anchored to the screen uses this frame's view
    this.cam.update(dt, layout, meX, meZ);
    this.scene.updateTransformMatrix(true);
    this.viewProj.copyFrom(this.scene.getTransformMatrix());

    // ---- heroes
    this.radar.reveal(meX, meZ);
    const radarAllies: { x: number; z: number; color: string; downed: boolean }[] = [];
    if (me) this.placeHero(this.heroView(me.id, me.hero), me, meX, meZ, me.yaw, dt, frozen, true);
    if (a && b) {
      for (const pa of a.players.values()) {
        if (pa.id === this.myId) continue;
        const pb = b.players.get(pa.id) ?? pa;
        const jump = Math.hypot(pb.x - pa.x, pb.z - pa.z) > 6;
        const x = jump ? pb.x : lerp(pa.x, pb.x, u);
        const z = jump ? pb.z : lerp(pa.z, pb.z, u);
        const yaw = lerpAngle(pa.yaw, pb.yaw, u);
        const same = pa.act === pb.act && pb.t >= pa.t && pa.combo === pb.combo;
        const shown: PlayerState = { ...pa, t: same ? lerp(pa.t, pb.t, u) : pa.t + since * TICK_HZ };
        const hv = this.heroView(pa.id, pa.hero);
        this.placeHero(hv, shown, x, z, yaw, dt, false, false);
        const downed = pa.act === Act.Downed;
        const color = this.slotColor(pa.id);
        const lp = this.lobby?.players.find((p) => p.id === pa.id);
        const name = lp?.name ?? '';
        // In view: a name tag over the head. Out of view: an arrow on the edge of the screen.
        const at = this.pointAt(`ally:${pa.id}`, x, hv.view.height + 0.35, z, color, downed ? `${name} — a terra` : name, downed ? 'ally down' : 'ally');
        if (at) {
          const title = lp?.title ? ` · ${lp.title}` : '';
          hud.nameTag(pa.id, at.x, at.y, downed ? `${name} — a terra` : `${name}${title}`, color, downed ? 'down' : '');
        }
        this.radar.reveal(x, z);
        radarAllies.push({ x, z, color, downed });
      }
    }
    for (const [id, hv] of this.heroViews) {
      if (hv.seen) continue;
      hv.view.dispose();
      this.heroViews.delete(id);
    }

    // ---- enemies
    let boss: EnemySnap | null = null;
    let lock: EnemySnap | null = null;
    let execTarget: EnemySnap | null = null;
    let execDist: number = TUNING.executeRange;
    const radarEnemies: { x: number; z: number; color: string; big: boolean }[] = [];
    if (a && b) {
      for (const ea of a.enemies.values()) {
        const eb = b.enemies.get(ea.id) ?? ea;
        const def = ENEMIES[ea.type];
        const jump = Math.hypot(eb.x - ea.x, eb.z - ea.z) > 5;
        const same = ea.state === eb.state && eb.t >= ea.t && ea.atk === eb.atk;
        const shown: EnemySnap = {
          ...ea,
          x: jump ? ea.x : lerp(ea.x, eb.x, u),
          z: jump ? ea.z : lerp(ea.z, eb.z, u),
          yaw: lerpAngle(ea.yaw, eb.yaw, u),
          t: same ? lerp(ea.t, eb.t, u) : ea.t + since,
        };
        let ev = this.enemyViews.get(ea.id);
        if (!ev) {
          const view = new CharacterView(this.scene, this.assets, ENEMY_LOOKS[ea.type], `enemy:${ea.id}`, this.shadow);
          ev = { view, snap: shown, state: -1, atk: -1, seen: true, dustTimer: 0, y: Number.NaN, surfaced: enemyHas(ea.st, ES.Burrow) ? 0 : 1 };
          this.enemyViews.set(ea.id, ev);
        }
        ev.seen = true;
        ev.snap = shown;
        this.placeEnemy(ev, shown, dt, frozen);
        const hidden = enemyHas(shown.st, ES.Burrow);
        // A sleeping garrison boss has no bar: it shows when the fight starts.
        if (def.bar && shown.state !== EState.Dead && (shown.state !== EState.Idle || shown.hp < shown.maxHp)) boss = shown;
        if (shown.id === this.lockId) lock = shown;
        if (me && shown.state === EState.Broken) {
          const d = Math.hypot(shown.x - meX, shown.z - meZ) - def.radius;
          if (d < execDist) {
            execDist = d;
            execTarget = shown;
          }
        }
        if (hidden) continue;
        this.enemyHud(ev, shown, me ? Math.hypot(shown.x - meX, shown.z - meZ) : 0);
        if (shown.state !== EState.Dead && !def.dummy && this.radar.isSeen(shown.x, shown.z)) {
          radarEnemies.push({ x: shown.x, z: shown.z, color: def.rank === 'base' ? '#ff4d3d' : '#ff9a3d', big: def.rank !== 'base' });
        }
      }
    }
    for (const [id, ev] of this.enemyViews) {
      if (ev.seen) continue;
      ev.view.dispose();
      this.enemyViews.delete(id);
    }
    this.drawBlades();

    // ---- zones and projectiles (latest snapshot, advanced to now)
    if (latest) {
      const age = Math.min(0.2, (now - latest.recv) / 1000);
      this.drawZones(latest.s, age, dt);
      for (const pr of latest.s.pr) {
        const x = pr.x + pr.dx * pr.speed * age;
        const z = pr.z + pr.dz * pr.speed * age;
        const c = this.projColor(pr.owner, pr.kind);
        const big = pr.kind.includes('big') || pr.kind.includes('orb') || pr.kind.includes('heavy');
        if (pr.kind.startsWith('bolt') || pr.kind === 'harpoon') {
          const len = pr.kind === 'harpoon' ? 3.2 : big ? 2.6 : 1.7;
          vfx.beam(x - pr.dx * len, 1.3, z - pr.dz * len, x, 1.3, z, big ? 0.16 : 0.1, c, 1);
          vfx.sprite(x, 1.3, z, big ? 0.4 : 0.26, c, 1);
        } else {
          const s = big ? 0.75 : pr.kind === 'spore' ? 0.6 : 0.48;
          vfx.sprite(x, 1.3, z, s * (1 + Math.sin(vfx.clock * 30) * 0.1), c, 1);
          vfx.sprite(x, 1.3, z, s * 0.45, WHITE, 0.9);
          vfx.glow(x, z, s * 2.4, c, 0.35);
        }
        if (Math.random() < dt * 40) vfx.burst(x, 1.3, z, 1, c, { speed: 0.6, life: 0.35, size: big ? 0.2 : 0.13 });
      }
    }

    this.drawWorld(dt, latest, me, meX, meZ);
    this.drawHud(dt, latest, me, meX, meZ, boss, lock, execTarget);

    this.radar.draw(
      {
        x: meX,
        z: meZ,
        yaw: this.cam.yaw,
        facing: me ? me.yaw : this.cam.yaw,
        allies: radarAllies,
        enemies: radarEnemies,
        pois: layout.pois.map((p, i) => ({ x: p.x, z: p.z, kind: p.kind, state: latest?.s.poi[i] ?? 0, color: POI_COLOR[p.kind] })),
        pings: this.pings.map((p) => ({ x: p.x, z: p.z, color: PING_COLOR[p.kind], age: p.age })),
        flood: this.flood,
      },
      dt,
    );

    // ---- ambience
    this.ambience(dt, meX, meZ);
  }

  /** A player's projectile takes the colour of their effects when they bought a recolour. */
  private projColor(owner: string, kind: string): RGB {
    const vfxId = this.lobby?.players.find((p) => p.id === owner)?.look.vfx;
    return (vfxId ? COSMETIC_BY_ID[vfxId]?.color : undefined) ?? PROJ_COLOR[kind] ?? WHITE;
  }

  /** Things that live in the world but not in the simulation's bodies: NPCs, PoIs, loot, pings, water. */
  private drawWorld(dt: number, latest: Frame | undefined, me: PlayerState | null, meX: number, meZ: number): void {
    const vfx = this.vfx;
    const hud = this.hud;
    const layout = this.layout!;
    const clock = vfx.clock;

    // ---- the tavern's people
    for (const n of this.npcViews) {
      const info = NPCS[n.id];
      if (!n.view) {
        n.view = new CharacterView(this.scene, this.assets, NPC_LOOKS[n.id as keyof typeof NPC_LOOKS], `npc:${n.id}`, this.shadow);
        const t = layout.table ?? layout.center;
        n.view.root.position.set(n.x, this.groundY(n.x, n.z), n.z);
        n.view.root.rotation.y = yawOf(t.x - n.x, t.z - n.z);
      }
      n.view.play(n.view.look.idle, clock + n.x, true);
      n.view.update(dt);
      const c = hexColor(info.color);
      vfx.ring(n.x, n.z, 1.1 + Math.sin(clock * 2 + n.x) * 0.05, c, 0.55);
      const at = this.project(n.x, n.view.height + 0.4, n.z);
      if (at) hud.nameTag(`npc:${n.id}`, at.x, at.y, `${info.name} · ${info.role}`, info.color, 'npc');
    }
    if (this.info!.kind === 'hub' && layout.table) {
      const t = layout.table;
      vfx.ring(t.x, t.z, 2.6 + Math.sin(clock * 2) * 0.06, GOLD, 0.6);
      vfx.glow(t.x, t.z, 4, GOLD, 0.18);
      const at = this.project(t.x, 2.6, t.z);
      if (at) hud.nameTag('npc:tavolo', at.x, at.y, NPCS.tavolo.name, NPCS.tavolo.color, 'npc');
    }

    // ---- points of interest
    layout.pois.forEach((poi, i) => {
      const state = latest?.s.poi[i] ?? 0;
      const near = Math.hypot(poi.x - meX, poi.z - meZ);
      const pulse = 0.5 + Math.sin(clock * 3 + i) * 0.5;
      if (poi.kind === 'chest') {
        if (state === 1) {
          vfx.ring(poi.x, poi.z, TUNING.interactRange, GOLD, 0.25 + pulse * 0.25);
          vfx.glow(poi.x, poi.z, 3.2, GOLD, 0.3 + pulse * 0.15);
          vfx.beam(poi.x, 0.6, poi.z, poi.x, 7, poi.z, 0.35, GOLD, 0.22 + pulse * 0.1);
          if (Math.random() < dt * 8) vfx.burst(poi.x, 1, poi.z, 1, GOLD, { speed: 0.4, life: 1.1, up: 1.6, radius: 0.9, size: 0.09 });
        }
      } else if (poi.kind === 'shrine') {
        if (state === 1) {
          vfx.ring(poi.x, poi.z, TUNING.shrineRadius, GREEN, 0.35 + pulse * 0.3);
          vfx.disc(poi.x, poi.z, TUNING.shrineRadius, GREEN, 0.12 + pulse * 0.06);
          vfx.glow(poi.x, poi.z, TUNING.shrineRadius * 1.3, GREEN, 0.22);
          if (Math.random() < dt * 14) vfx.burst(poi.x, 0.2, poi.z, 1, GREEN, { speed: 0.3, life: 1.4, up: 1.8, flat: 1, radius: TUNING.shrineRadius * Math.random(), size: 0.1 });
        } else {
          vfx.ring(poi.x, poi.z, 1.6, GREEN, 0.15);
        }
      } else if (state === 1) {
        const spin = clock * 1.6;
        vfx.disc(poi.x, poi.z, 2.3, VIOLET, 0.5);
        vfx.ring(poi.x, poi.z, 2.3 * (1 - ((clock * 0.7) % 1)), VIOLET, 0.7);
        vfx.ring(poi.x, poi.z, 2.5, WHITE, 0.35 + pulse * 0.3);
        vfx.beam(poi.x, 0.2, poi.z, poi.x, 9, poi.z, 0.9, VIOLET, 0.3);
        for (let k = 0; k < 6; k++) {
          const ang = spin + (k * Math.PI) / 3;
          vfx.sprite(poi.x + Math.sin(ang) * 1.6, 0.6 + ((clock * 0.8 + k * 0.17) % 1) * 3.2, poi.z + Math.cos(ang) * 1.6, 0.22, [0.85, 0.6, 1], 0.9);
        }
      } else {
        vfx.ring(poi.x, poi.z, 2.3, VIOLET, 0.18);
      }
      if (near < 22 && state !== 2) {
        const at = this.project(poi.x, 3.4, poi.z);
        const locked = poi.kind === 'portal' && state === 0;
        if (at) hud.nameTag(`poi:${poi.id}`, at.x, at.y, locked ? `${POI_NAME[poi.kind]} · sigillato` : POI_NAME[poi.kind], POI_COLOR[poi.kind], 'poi');
      } else if (poi.kind === 'portal' && state === 1) {
        // An open portal is always worth finding: point to it from anywhere.
        this.pointAt(`poi:${poi.id}`, poi.x, 2, poi.z, POI_COLOR.portal, 'Portale', 'poi');
      }
    });

    // ---- instanced loot: it drifts to its owner, the server decides when it is taken
    for (const d of this.drops.values()) {
      d.age += dt;
      if (me) {
        const dx = meX - d.x;
        const dz = meZ - d.z;
        const dist = Math.hypot(dx, dz);
        if (dist < DROP_MAGNET && dist > 0.2 && d.age > 0.35) {
          const step = Math.min(dist, (6 + (DROP_MAGNET - dist) * 3) * dt);
          d.x += (dx / dist) * step;
          d.z += (dz / dist) * step;
        }
      }
      const c = DROP_RGB[d.kind];
      const bob = 0.75 + Math.sin(clock * 4 + d.id) * 0.14;
      const size = d.kind === 'orb' ? 0.55 : d.kind === 'thread' ? 0.3 : 0.34;
      vfx.sprite(d.x, bob, d.z, size, c, 1);
      vfx.sprite(d.x, bob, d.z, size * 0.45, WHITE, 0.9);
      vfx.glow(d.x, d.z, d.kind === 'orb' ? 1.8 : 0.9, c, 0.4);
    }

    // ---- pings
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i]!;
      p.age += dt;
      if (p.age > PING_LIFE) {
        this.pings.splice(i, 1);
        continue;
      }
      const c = PING_RGB[p.kind];
      const fade = Math.min(1, (PING_LIFE - p.age) / 1.2);
      const wave = (clock * 1.3 + i * 0.37) % 1;
      vfx.ring(p.x, p.z, 0.7 + wave * 2.2, c, (1 - wave) * fade);
      vfx.ring(p.x, p.z, 0.7, c, 0.9 * fade);
      vfx.beam(p.x, 0.1, p.z, p.x, 6.5, p.z, 0.2, c, 0.5 * fade);
      vfx.sprite(p.x, 6.6, p.z, 0.55, c, fade);
      const who = this.nameOf(p.by);
      const text = who ? `${PING_TEXT[p.kind]} · ${who}` : PING_TEXT[p.kind];
      const at = this.pointAt(`ping:${i}`, p.x, 7.2, p.z, PING_COLOR[p.kind], text, `ping ${p.kind}`);
      if (at) hud.nameTag(`ping:${i}`, at.x, at.y, text, PING_COLOR[p.kind], `ping ${p.kind}`);
    }

    // ---- toxic water
    const wet = this.flood > FLOOD_DRY;
    if (wet) {
      const goal = FLOOR_Y + this.flood * STEP_HEIGHT + 0.55;
      if (!this.water.isEnabled()) {
        this.water.setEnabled(true);
        this.waterY = goal - STEP_HEIGHT;
      }
      this.waterY += (goal - this.waterY) * (1 - Math.exp(-dt * 0.9));
      this.water.position.y = this.waterY + Math.sin(clock * 1.3) * 0.05;
      if (Math.random() < dt * 20) {
        const ang = Math.random() * Math.PI * 2;
        const dist = Math.random() * 26;
        const x = meX + Math.sin(ang) * dist;
        const z = meZ + Math.cos(ang) * dist;
        if (standElevation(layout, x, z) <= this.flood && getCellElevation(layout, x, z) !== ELEV_WALL) {
          vfx.puff(x, 0.7, z, 1, [0.3, 0.7, 0.25], 0.4, 0.8, 1.2, 0.7);
        }
      }
    } else if (this.water.isEnabled()) {
      this.water.setEnabled(false);
    }
  }

  /** Floor height under a point; inside a wall, `fallback` (the floor nearby). */
  private rawGroundY(x: number, z: number, fallback: number): number {
    const raw = this.layout ? getCellElevation(this.layout, x, z) : 0;
    return raw === ELEV_WALL ? fallback : FLOOR_Y + raw * STEP_HEIGHT;
  }

  private groundY(x: number, z: number): number {
    return this.rawGroundY(x, z, this.meFeet);
  }

  /** Visual feet height. Snaps across teleports, eases across a single terrace. */
  private smoothFeet(current: number, x: number, z: number, dt: number): number {
    const goal = this.groundY(x, z);
    if (!Number.isFinite(current) || Math.abs(goal - current) > 8) return goal;
    return current + (goal - current) * (1 - Math.exp(-Math.min(dt, 0.05) * 10));
  }

  private placeHero(hv: HeroView, p: PlayerState, x: number, z: number, yaw: number, dt: number, frozen: boolean, isMe: boolean): void {
    const view = hv.view;
    const vfx = this.vfx;
    const hero = HEROES[p.hero];
    const c = this.colorOf(p.id, p.hero);
    const pirouette = p.act === Act.Dodge && hero.dodge.kind === 'pirouette' && !p.blink;
    const spinU = pirouette ? Math.min(1, p.t / TICK_HZ / hero.dodge.dur) : 0;
    hv.y = this.smoothFeet(hv.y, x, z, dt);
    view.root.position.set(x, hv.y + Math.sin(spinU * Math.PI) * 0.22, z);
    view.root.rotation.y = yaw;
    view.trackMotion(dt);

    let wolf = false;
    let stealth = false;
    let glowR = 0;
    let glowG = 0;
    let glowB = 0;
    for (const s of p.st) {
      if (s.k === PS.Wolf) {
        wolf = true;
        glowR += 0.35;
      } else if (s.k === PS.Stealth) stealth = true;
      else if (s.k === PS.Berserk) {
        glowG += 0.3;
        glowB += 0.25;
      } else if (s.k === PS.Counter) {
        const pulse = 0.25 + Math.sin(vfx.clock * 14) * 0.12;
        glowR += pulse;
        glowG += pulse * 0.75;
      } else if (s.k === PS.Guard) {
        glowG += 0.12;
        glowB += 0.2;
      } else if (s.k === PS.Silence) {
        glowR += 0.08;
        glowB += 0.16;
      } else if (s.k === PS.Leech) {
        glowR += 0.22;
        vfx.ring(x, z, 1.3 + Math.sin(vfx.clock * 5) * 0.08, [0.9, 0.15, 0.25], 0.45);
      } else if (s.k === PS.Frenzy) {
        glowR += 0.1;
        glowG += 0.05;
      } else if (s.k === PS.Reflect) {
        vfx.ring(x, z, 1.15, ICE, 0.6 + Math.sin(vfx.clock * 6) * 0.2);
      }
    }
    if (p.act === Act.Charge) {
      const k = Math.min(1, p.t / TICK_HZ / TUNING.maxCharge);
      glowR += c[0] * k * 0.5;
      glowG += c[1] * k * 0.5;
      glowB += c[2] * k * 0.5;
      const full = k >= 1;
      if (full && !hv.fullCharge) {
        vfx.implode(x, z, 2, c, 0.2);
        vfx.flash(x, 1.4, z, 1.6, c);
        if (isMe) this.audio.play('chargeFull');
      }
      hv.fullCharge = full;
      if (Math.random() < dt * 30) vfx.burst(x, 1.2, z, 1, c, { speed: 3, life: 0.3, radius: 1.4, inward: true, size: 0.1 });
    } else {
      hv.fullCharge = false;
    }
    view.glow.set(glowR, glowG, glowB);
    view.setFade(stealth ? 0.35 : 1);
    if (wolf !== hv.wolf) {
      hv.wolf = wolf;
      view.root.scaling.setAll(view.look.scale * (wolf ? 1.28 : 1));
    }

    posePlayer(view, p, dt, { frozen, locked: isMe ? this.lockId !== 0 : false });
    view.update(dt);

    // Swings, dodges and guard: derived from the state so local and remote heroes look the same.
    const attack = p.act === Act.Attack || p.act === Act.Heavy ? currentAttack(p) : null;
    if (attack) {
      const cont = hv.act === p.act && hv.combo === p.combo && p.t >= hv.t;
      const prevT = cont ? hv.t : 0;
      const heavy = p.act === Act.Heavy;
      if (!cont && !attack.proj) this.audio.play(heavy ? 'swingHeavy' : 'swing', isMe ? 1 : 0.35);
      for (let i = 0; i < attack.hits.length; i++) {
        const ht = attack.hits[i]! * TICK_HZ;
        if (!(prevT < ht && p.t >= ht)) continue;
        const fx = Math.sin(yaw);
        const fz = Math.cos(yaw);
        if (attack.proj || (hero.ranged && attack.charged === 'pull')) {
          vfx.flash(x + fx * 0.9, 1.35, z + fz * 0.9, heavy ? 1.3 : 0.8, c);
          this.audio.play('shoot', isMe ? 1 : 0.35);
        } else if (attack.aoe) {
          const ahead = attack.aoeAhead ?? 0;
          vfx.shockwave(x + fx * ahead, z + fz * ahead, attack.aoe, c, 0.3);
          vfx.slash(x, 1.2 * view.look.scale, z, yaw, attack.range + 0.4, c, 1, 0.9, 0.22, 1.2);
        } else {
          const dir = (p.combo + i) % 2 === 0 ? 1 : -1;
          const wide = attack.arc >= 300;
          vfx.slash(x, 1.25 * view.look.scale, z, yaw, attack.range + 0.5, c, dir, heavy ? 0.55 : 0.18 + (p.combo % 3) * 0.12, heavy ? 0.24 : 0.18, heavy ? 1.3 : 1);
          if (wide) vfx.slash(x, 1.25 * view.look.scale, z, yaw + Math.PI, attack.range + 0.5, c, dir, 0.1, 0.24, 1);
        }
      }
    }
    if (p.act === Act.Dodge && hv.act !== Act.Dodge) {
      this.audio.play('dodge', isMe ? 1 : 0.3);
      if (p.blink) {
        vfx.puff(hv.x, 0.8, hv.z, 5, [0.3, 0.1, 0.5], 0.4, 1.4, 0.5);
        vfx.implode(hv.x, hv.z, 1.6, c, 0.2);
        vfx.shockwave(x, z, 1.8, c, 0.25);
      } else if (hero.dodge.kind === 'pirouette') {
        vfx.shockwave(x, z, 1.35, [0.9, 0.18, 0.36], 0.32);
        vfx.burst(x, 1.05, z, 16, [1, 0.74, 0.42], { speed: 3.2, life: 0.55, up: 2.6, flat: 0.35, size: 0.12 });
      } else {
        vfx.puff(x, 0.15, z, 3, [0.5, 0.45, 0.4], 0.4, 0.5, 0.5, 0.6);
      }
    }
    if (pirouette) {
      const turns = hero.dodge.turns ?? 2;
      const spin = spinU * Math.PI * 2 * turns;
      vfx.ring(x, z, 0.42 + Math.sin(spinU * Math.PI) * 0.38, [0.85, 0.16, 0.32], 0.55);
      for (let i = 0; i < 8; i++) {
        const a = spin - i * 0.55;
        const h = 0.18 + (i / 7) * 1.7;
        const gold = i % 2 === 0;
        vfx.sprite(
          x + Math.sin(a) * 0.46,
          h,
          z + Math.cos(a) * 0.46,
          gold ? 0.11 : 0.18,
          gold ? [1, 0.78, 0.45] : [0.86, 0.14, 0.32],
          0.8,
        );
      }
    } else if (p.act === Act.Dodge && !p.blink && Math.random() < dt * 50) {
      vfx.burst(x, 0.9, z, 1, c, { speed: 0.5, life: 0.25, size: 0.3 });
    }
    if (p.act === Act.Block) {
      vfx.sector(x, z, 1.7, yaw, TUNING.blockArc, [0.5, 0.75, 1], p.t < TUNING.perfectParry * TICK_HZ ? 0.55 : 0.2);
    }
    if (p.act === Act.Downed) {
      vfx.ring(x, z, 1.2 + Math.sin(vfx.clock * 4) * 0.08, RED, 0.7);
    } else {
      vfx.ring(x, z, 0.85 * view.look.scale, c, isMe ? 0.75 : 0.5);
    }
    if (p.act === Act.Revive) {
      const k = Math.min(1, p.t / TICK_HZ / TUNING.reviveTime);
      vfx.ring(x, z, 0.4 + k * 2.2, GREEN, 0.9);
    }
    if (p.act === Act.Channel) {
      // Anyone can see who is standing defenceless at a chest.
      vfx.ring(x, z, 1.4 + Math.sin(vfx.clock * 9) * 0.12, GOLD, 0.85);
      if (Math.random() < dt * 24) vfx.burst(x, 0.3, z, 1, GOLD, { speed: 0.4, life: 0.7, up: 2.6, radius: 1.1, flat: 1, size: 0.09 });
    }
    hv.act = p.act;
    hv.combo = p.combo;
    hv.t = p.t;
    hv.x = x;
    hv.z = z;
    hv.yaw = yaw;
  }

  private placeEnemy(ev: EnemyView, e: EnemySnap, dt: number, frozen: boolean): void {
    const view = ev.view;
    const vfx = this.vfx;
    const def = ENEMIES[e.type];
    ev.y = this.smoothFeet(ev.y, e.x, e.z, dt);
    // Stone Crabs dig into the low channels: nothing shows until they surface to strike.
    const burrowed = enemyHas(e.st, ES.Burrow);
    ev.surfaced += ((burrowed ? 0 : 1) - ev.surfaced) * (1 - Math.exp(-dt * 12));
    view.root.position.set(e.x, ev.y - (1 - ev.surfaced) * 2.8, e.z);
    view.root.rotation.y = e.yaw;
    view.trackMotion(dt);
    const iced = enemyHas(e.st, ES.Frozen);
    poseEnemy(view, e, def, dt, frozen || iced);

    let r = 0;
    let g = 0;
    let b = 0;
    const atk: EnemyAttackDef | undefined = def.attacks[e.atk];
    if (e.state === EState.Windup && atk) {
      const k = Math.min(1, e.t / atk.windup);
      const c = atk.kind === 'red' ? RED : BLUE;
      const pulse = 0.25 + k * 0.55;
      r += c[0] * pulse;
      g += c[1] * pulse;
      b += c[2] * pulse;
      this.telegraph(e, def.radius, atk, k, c);
      if (ev.state !== EState.Windup || ev.atk !== e.atk) {
        const size = def.boss ? 1.9 : def.elite ? 1.3 : 1;
        vfx.glint(() => view.worldPosition('handslot.r', this.tmp), c, 0.42, size);
        const d = this.me ? Math.hypot(e.x - this.me.x, e.z - this.me.z) : 99;
        if (d < 26) this.audio.play(atk.kind === 'red' ? 'warnRed' : 'warnBlue', d < 12 ? 1 : 0.45);
      }
    } else if (ev.state === EState.Windup && e.state === EState.Recover && atk && !atk.proj && !atk.special && !atk.aoe) {
      const c: RGB = atk.kind === 'red' ? [1, 0.35, 0.25] : [0.75, 0.85, 1];
      vfx.slash(e.x, 1.2 * view.look.scale, e.z, e.yaw, atk.reach + 0.3, c, 1, 0.25, 0.22, 1.1);
      this.audio.play('swing', 0.3);
    }
    if (e.state === EState.Broken) {
      const pulse = 0.35 + Math.sin(vfx.clock * 10) * 0.2;
      r += pulse;
      g += pulse * 0.75;
      vfx.ring(e.x, e.z, def.radius + 0.9 + Math.sin(vfx.clock * 6) * 0.1, GOLD, 0.9);
    }
    if (iced) {
      g += 0.3;
      b += 0.5;
      vfx.ring(e.x, e.z, def.radius + 0.5, ICE, 0.6);
    }
    if (enemyHas(e.st, ES.Marked)) {
      vfx.ring(e.x, e.z, def.radius + 0.7, RED, 0.55 + Math.sin(vfx.clock * 8) * 0.2);
      vfx.sprite(e.x, view.height + 0.5, e.z, 0.22, RED, 0.9);
    }
    if (enemyHas(e.st, ES.Confused)) {
      for (let i = 0; i < 3; i++) {
        const a = vfx.clock * 4 + (i * Math.PI * 2) / 3;
        vfx.sprite(e.x + Math.sin(a) * 0.55, view.height + 0.25, e.z + Math.cos(a) * 0.55, 0.16, [0.85, 0.45, 1], 0.95);
      }
    }
    if (enemyHas(e.st, ES.Taunted)) vfx.sprite(e.x, view.height + 0.45, e.z, 0.2, ICE, 0.8);
    if (enemyHas(e.st, ES.Bleed) && Math.random() < dt * 10) {
      vfx.burst(e.x, view.height * 0.5, e.z, 1, [0.8, 0.08, 0.1], { speed: 1, life: 0.5, gravity: 9, size: 0.1 });
    }
    if (enemyHas(e.st, ES.Silenced)) vfx.sprite(e.x, view.height + 0.3, e.z, 0.26, VIOLET, 0.85);
    if (enemyHas(e.st, ES.Ward)) vfx.ring(e.x, e.z, def.radius + 0.6, WHITE, 0.4 + Math.sin(vfx.clock * 10) * 0.2);
    if (e.state === EState.Dead) {
      view.setFade(Math.max(0, Math.min(1, (2.5 - e.t) / 0.7)));
    } else if (e.state === EState.Spawn) {
      view.setFade(Math.min(1, e.t * 1.6));
    } else {
      view.setFade(1);
    }
    if (def.boss && e.state !== EState.Dead) {
      vfx.glow(e.x, e.z, def.radius * 2.6, RED, 0.25 + e.phase * 0.12);
      ev.dustTimer -= dt;
      if (view.speed > 2 && ev.dustTimer <= 0) {
        ev.dustTimer = 0.28;
        vfx.puff(e.x, 0.1, e.z, 2, [0.4, 0.35, 0.35], 0.8, 0.6, 0.6, 0.9);
        this.shakeNear(e.x, e.z, 0.16);
      }
    }
    if (ev.surfaced < 0.05) view.setFade(0);
    view.glow.set(r, g, b);
    view.update(dt);
    ev.state = e.state;
    ev.atk = e.atk;
  }

  /** Ground marker showing where an enemy attack will land, filling up as the strike approaches. */
  private telegraph(e: EnemySnap, radius: number, atk: EnemyAttackDef, k: number, c: RGB): void {
    const vfx = this.vfx;
    const y = this.groundY(e.x, e.z) + 0.04;
    if (atk.proj || atk.special) {
      vfx.ring(e.x, e.z, radius + 0.6 + (1 - k) * 1.2, c, 0.4 + k * 0.5, y);
      return;
    }
    if (atk.aoe) {
      const ay = this.groundY(e.ax, e.az) + 0.04;
      vfx.disc(e.ax, e.az, atk.aoe, c, 0.35 + k * 0.4, ay);
      vfx.disc(e.ax, e.az, atk.aoe * k, c, 0.5, ay);
      return;
    }
    // Lunging attacks travel during the wind-up: the marker follows the enemy.
    vfx.sector(e.x, e.z, atk.reach, e.yaw, atk.arc, c, 0.3 + k * 0.4, y);
    vfx.sector(e.x, e.z, atk.reach * k, e.yaw, atk.arc, c, 0.45, y);
  }

  /** Lama: a gold rule and the line, sitting to the screen-right of the speaker's head. */
  private drawBlades(): void {
    const now = performance.now();
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const box = Math.min(250, width * 0.34);
    for (let i = this.blades.length - 1; i >= 0; i--) {
      const blade = this.blades[i]!;
      if (now > blade.until) {
        this.blades.splice(i, 1);
        continue;
      }
      const ev = this.enemyViews.get(blade.id);
      const snap = ev?.snap;
      if (!ev || !snap || snap.state === EState.Dead) continue;
      const at = this.project(snap.x, ev.view.height * 0.72, snap.z);
      if (!at) {
        this.hud.holdBlade(blade.id);
        continue;
      }
      const x = Math.min(Math.max(8, at.x + 22), Math.max(8, width - box - 8));
      const y = Math.min(Math.max(8, at.y - 10), Math.max(8, height - 72));
      this.hud.blade(blade.id, x, y, blade.who, blade.text);
    }
  }

  private enemyHud(ev: EnemyView, e: EnemySnap, dist: number): void {
    const def = ENEMIES[e.type];
    if (e.state === EState.Dead || def.bar) return;
    const locked = e.id === this.lockId;
    const hurt = e.hp < e.maxHp || e.poise > 0.02;
    if (!locked && !(hurt && dist < 30) && !(def.elite && dist < 24) && e.state !== EState.Broken) return;
    const at = this.project(e.x, ev.view.height + 0.3, e.z);
    if (!at) return;
    const broken = e.state === EState.Broken;
    this.hud.enemyBar(
      e.id,
      at.x,
      at.y,
      e.hp / e.maxHp,
      broken ? 1 : e.poise,
      `${locked ? 'locked' : ''} ${broken ? 'broken' : ''} ${def.elite ? 'elite' : ''}`,
      locked || def.elite || def.dummy ? def.name : '',
    );
  }

  private drawZones(s: Snapshot, age: number, dt: number): void {
    const vfx = this.vfx;
    for (const z of s.z) {
      const t = z.t + age;
      const left = z.dur - t;
      const fade = Math.max(0, Math.min(1, left / 0.6, t / 0.3));
      switch (z.kind) {
        case 'bubble':
          vfx.dome(z.x, z.z, z.r, GOLD, 0.1 * fade);
          vfx.ring(z.x, z.z, z.r, GOLD, 0.9 * fade);
          vfx.glow(z.x, z.z, z.r * 1.2, GOLD, 0.12 * fade);
          if (Math.random() < dt * 14) vfx.burst(z.x, 0.3, z.z, 1, GOLD, { speed: 0.3, life: 1.2, up: 1.6, flat: 1, radius: z.r * Math.random(), size: 0.1 });
          break;
        case 'silence':
          vfx.dome(z.x, z.z, z.r, [0.07, 0.02, 0.14], 0.34 * fade, true);
          vfx.ring(z.x, z.z, z.r, VIOLET, 0.95 * fade);
          vfx.ring(z.x, z.z, z.r * (0.3 + ((vfx.clock * 0.35) % 1) * 0.7), VIOLET, 0.3 * fade);
          break;
        case 'rain':
          vfx.disc(z.x, z.z, z.r, [0.75, 0.85, 1], 0.5 * fade);
          for (let i = 0; i < 3; i++) {
            if (Math.random() > dt * 60) continue;
            const a = Math.random() * Math.PI * 2;
            const d = Math.sqrt(Math.random()) * z.r;
            const x = z.x + Math.sin(a) * d;
            const zz = z.z + Math.cos(a) * d;
            vfx.beam(x + 0.6, 9, zz, x, 0.1, zz, 0.07, [0.85, 0.92, 1], 0.8);
            if (Math.random() < 0.4) vfx.burst(x, 0.15, zz, 3, [0.85, 0.92, 1], { speed: 3, life: 0.25, flat: 0.8, size: 0.08 });
          }
          break;
        case 'blackhole': {
          const pulse = 1 + Math.sin(vfx.clock * 9) * 0.06;
          vfx.dome(z.x, z.z, 1.3 * pulse, [0.02, 0, 0.05], 0.92 * fade, true);
          vfx.disc(z.x, z.z, z.r, VIOLET, 0.55 * fade);
          vfx.ring(z.x, z.z, z.r * (1 - ((vfx.clock * 0.9) % 1)), VIOLET, 0.6 * fade);
          vfx.sprite(z.x, 1.2, z.z, 2.6 * pulse, VIOLET, 0.35 * fade);
          if (Math.random() < dt * 70) vfx.burst(z.x, 1, z.z, 1, [0.75, 0.4, 1], { speed: 9, life: 0.5, radius: z.r * 0.8, inward: true, flat: 0.8, stretch: 0.05, drag: 0 });
          break;
        }
        case 'pull':
          vfx.disc(z.x, z.z, z.r, VIOLET, 0.5 * fade);
          vfx.ring(z.x, z.z, z.r * (1 - t / z.dur), VIOLET, 0.8);
          if (Math.random() < dt * 60) vfx.burst(z.x, 1, z.z, 1, [0.75, 0.4, 1], { speed: 10, life: 0.35, radius: z.r * 0.8, inward: true, flat: 0.8, stretch: 0.05, drag: 0 });
          break;
        case 'ring': {
          const r = Math.max(0.3, t * 10);
          vfx.ring(z.x, z.z, r, RED, 1);
          vfx.ring(z.x, z.z, r - 0.35, [1, 0.45, 0.2], 0.8);
          vfx.ring(z.x, z.z, r + 0.3, RED, 0.35);
          break;
        }
        case 'burst':
        case 'shock': {
          const k = Math.min(1, t / z.dur);
          vfx.disc(z.x, z.z, z.r, RED, 0.3 + k * 0.5);
          vfx.disc(z.x, z.z, z.r * k, [1, 0.5, 0.2], 0.5);
          if (z.kind === 'shock') vfx.ring(z.x, z.z, z.r, WHITE, 0.4 + k * 0.6);
          break;
        }
        case 'toxic':
          vfx.disc(z.x, z.z, z.r, TOXIC, 0.3 * fade);
          vfx.ring(z.x, z.z, z.r, TOXIC, 0.7 * fade);
          if (Math.random() < dt * 22) {
            const a = Math.random() * Math.PI * 2;
            const d = Math.sqrt(Math.random()) * z.r;
            vfx.puff(z.x + Math.sin(a) * d, 0.5, z.z + Math.cos(a) * d, 1, [0.3, 0.55, 0.15], 0.5, 0.7, 1.5, 1.5);
          }
          break;
        case 'shrine':
          vfx.disc(z.x, z.z, z.r, GREEN, 0.3 * fade);
          vfx.ring(z.x, z.z, z.r, GREEN, 0.95 * fade);
          vfx.ring(z.x, z.z, z.r * (0.2 + ((vfx.clock * 0.5) % 1) * 0.8), [0.8, 1, 0.85], 0.4 * fade);
          vfx.glow(z.x, z.z, z.r * 1.4, GREEN, 0.3 * fade);
          if (Math.random() < dt * 40) vfx.burst(z.x, 0.2, z.z, 1, [0.7, 1, 0.8], { speed: 0.3, life: 1.3, up: 2.4, flat: 1, radius: z.r * Math.sqrt(Math.random()), size: 0.11 });
          break;
        case 'ember':
          vfx.disc(z.x, z.z, z.r, EMBER, 0.4 * fade);
          vfx.ring(z.x, z.z, z.r, [1, 0.7, 0.2], 0.6 * fade);
          vfx.glow(z.x, z.z, z.r * 1.2, EMBER, 0.25 * fade);
          if (Math.random() < dt * 30) vfx.burst(z.x, 0.2, z.z, 1, [1, 0.6, 0.15], { speed: 0.4, life: 0.7, up: 2.8, flat: 1, radius: z.r * Math.sqrt(Math.random()), size: 0.14 });
          break;
      }
    }
  }

  private drawHud(
    dt: number,
    latest: Frame | undefined,
    me: PlayerState | null,
    meX: number,
    meZ: number,
    boss: EnemySnap | null,
    lock: EnemySnap | null,
    execTarget: EnemySnap | null,
  ): void {
    const hud = this.hud;
    const info = this.info!;
    const lobby = this.lobby;
    const inHub = info.kind === 'hub';
    const use = this.touch.shown ? 'Usa' : 'F';
    if (me) {
      hud.updateMe(me, dt);
      const silenced = me.st.some((s) => s.k === PS.Silence) && !me.st.some((s) => s.k === PS.Bubble);
      this.touch.setSkills(me.cd <= 0, me.ult >= 100, silenced);
    } else this.touch.setSkills(false, false, false);

    if (lobby && latest) {
      const party: PartyEntry[] = [];
      for (const p of lobby.players) {
        if (p.id === this.myId || !p.hero) continue;
        const st = latest.players.get(p.id);
        party.push({
          id: p.id,
          name: p.name,
          hero: HEROES[p.hero],
          hp: st ? st.hp : 0,
          maxHp: st ? st.maxHp || HEROES[p.hero].hp : HEROES[p.hero].hp,
          downed: st ? st.act === Act.Downed : false,
        });
      }
      hud.setParty(party);
    }

    // ---- where we are and what is left to do
    const portal = this.poisLite.find((p) => p.kind === 'portal');
    if (inHub) {
      hud.setStage(info.title, lobby?.host === this.myId ? 'Scegli la rotta al Tavolo della Mappa' : `La rotta la sceglie ${this.nameOf(lobby?.host ?? '') || 'chi guida'}`);
      hud.setRun([]);
      hud.setPurse('Banca', this.profile.gems, this.profile.threads);
      hud.setSynergy([]);
    } else {
      const left = latest?.s.left ?? 0;
      const goal = lobby?.vote ? 'Portale aperto · votate' : portal?.ready ? 'Portale aperto · raggiungetelo' : left > 0 ? `nemici ${left}` : '';
      hud.setStage(info.title, goal ? `${info.label} · ${goal}` : info.label);
      const run = lobby?.run;
      const chips: { text: string; cls: string; title?: string }[] = [];
      if (run) {
        if (run.fervor > 0) chips.push({ text: `Fervore +${Math.round(run.fervor * 100)}%`, cls: 'fervor', title: 'Moltiplicatore del bottino per chi prosegue senza salvare' });
        if (run.company > 0) chips.push({ text: `Compagnia +${Math.round(run.company * 100)}%`, cls: 'company', title: 'Bonus alla probabilità di drop per ogni eroe in più' });
        const bounty = run.bounty ? BOUNTY_BY_ID[run.bounty] : undefined;
        if (bounty) {
          const state = run.bountyState === 'done' ? 'riuscito' : run.bountyState === 'failed' ? 'fallito' : 'in corso';
          chips.push({ text: `${bounty.name} · ${state}`, cls: `bounty ${run.bountyState}`, title: bounty.text });
        }
      }
      hud.setRun(chips);
      hud.setPurse('Bisaccia', this.satchel.gems, this.satchel.threads, 'non ancora in banca');
      hud.setSynergy((latest?.s.syn ?? []).map((id) => synergyInfo(id)));
    }

    // ---- the Choice Terminal
    const vote = lobby?.vote;
    if (vote && lobby && !inHub) {
      hud.setVote({
        next: vote.next,
        nextFervor: vote.nextFervor,
        mine: vote.votes[this.myId] ?? '',
        rows: lobby.players
          .filter((p) => p.id in vote.votes)
          .map((p) => ({ name: p.name, color: SLOT_COLORS[p.slot % SLOT_COLORS.length]!, choice: vote.votes[p.id] ?? '' })),
        touch: this.touch.shown,
      });
    } else {
      hud.setVote(null);
    }

    if (boss) {
      const def = ENEMIES[boss.type];
      hud.setBoss(def.name, boss.hp / boss.maxHp, boss.state === EState.Broken ? 1 : boss.poise, boss.state === EState.Broken);
      this.audio.setMood(def.boss ? 'boss' : 'battle');
    } else {
      hud.setBoss(null);
    }

    if (lock) {
      const at = this.project(lock.x, this.enemyHeight(lock.id) * 0.55, lock.z);
      hud.reticle(at?.x ?? 0, at?.y ?? 0, !!at);
    } else {
      hud.reticle(0, 0, false);
    }

    // ---- channel gauge and the context prompt: the most urgent thing the interact key can do
    let prompt: string | null = null;
    let downedText: string | null = null;
    if (me) {
      const channelling = me.act === Act.Channel ? this.poisLite.find((p) => p.id === me.tgt) : undefined;
      if (channelling) hud.setGauge(Math.min(1, me.t / TICK_HZ / channelTime(channelling.kind)), CHANNEL_TEXT[channelling.kind]);
      else if (me.act === Act.Channel) hud.setGauge(null, '');

      if (me.act === Act.Downed) {
        downedText = this.alliesLite.some((a) => a.id !== me.id && !a.downed)
          ? `Sei a terra — un compagno può rialzarti restandoti accanto e tenendo premuto ${use}`
          : 'Sei a terra';
      } else if (me.act === Act.Revive) {
        prompt = 'Rianimazione in corso…';
      } else if (channelling) {
        prompt = channelling.kind === 'chest' ? 'Resta fermo: finché canalizzi sei indifeso' : null;
      } else if (execTarget && me.act !== Act.Execute) {
        prompt = `[${use}] Esecuzione`;
      } else {
        const fallen = this.alliesLite.find((a) => a.downed && a.id !== me.id && Math.hypot(a.x - meX, a.z - meZ) <= TUNING.reviveRange);
        const poi = this.poisLite.find((p) => p.ready && Math.hypot(p.x - meX, p.z - meZ) <= TUNING.interactRange);
        const npc = inHub ? this.nearNpc(me) : null;
        if (fallen) prompt = `Tieni premuto [${use}] per rialzare ${this.nameOf(fallen.id)}`;
        else if (poi) {
          prompt =
            poi.kind === 'chest'
              ? `Tieni premuto [${use}] per ${TUNING.chestChannel} secondi: Forziere di Sinergia (sei indifeso)`
              : poi.kind === 'shrine'
                ? `Tieni premuto [${use}]: attiva il Santuario di Cura`
                : `Tieni premuto [${use}]: apri il Terminale di Scelta`;
        } else if (npc) prompt = `[${use}] ${NPCS[npc].prompt}`;
        else if (lock) prompt = personaOf(lock.type).strategy;
        else if (inHub) prompt = this.touch.shown ? 'Il Tavolo della Mappa è al centro della sala' : 'Tavolo della Mappa al centro · [I] scheda · [C] cambia eroe · [B] bestiario';
      }
    }
    hud.prompt(this.menus.open ? null : prompt);
    hud.setDowned(downedText);

    const count = lobby ? lobby.players.length : 1;
    hud.setRoom(
      this.conn?.offline
        ? 'Partita in solitaria · H comandi'
        : `${lobby?.public ? 'Taverna' : 'Stanza'} ${lobby?.code ?? ''} · ${count}/${MAX_PLAYERS} · ${Math.round(this.rtt)} ms · H comandi`,
    );
    hud.endFrame();
  }

  private ambience(dt: number, x: number, z: number): void {
    const arena = this.arena;
    if (!arena) return;
    const vfx = this.vfx;
    this.flameTimer -= dt;
    const emit = this.flameTimer <= 0;
    if (emit) this.flameTimer = 0.05;
    for (const f of arena.flames) {
      if (Math.hypot(f.x - x, f.z - z) > 46) continue;
      // Torches on a wall that is being cut away would float in mid-air.
      if (this.cam.cutPlane.normal.x * f.x + this.cam.cutPlane.normal.z * f.z + this.cam.cutPlane.d > 0) continue;
      const flick = 1 + Math.sin(vfx.clock * 17 + f.x * 3) * 0.12;
      // Flames sit at an absolute height: on a wall, on a brazier, on a shrine.
      const fy = f.y - this.groundY(f.x, f.z);
      vfx.spriteAt(f.x, f.y, f.z, (f.big ? 0.75 : 0.36) * flick, f.color, 0.85);
      vfx.spriteAt(f.x, f.y, f.z, (f.big ? 2.4 : 1.3) * flick, f.color, 0.12);
      if (emit) vfx.burst(f.x, fy, f.z, 1, f.color, { speed: 0.25, life: f.big ? 0.7 : 0.45, up: f.big ? 2.4 : 1.4, size: f.big ? 0.26 : 0.13, drag: 0.5 });
    }
    // Ash and motes drifting through the air sell the Eclipse.
    this.moteTimer -= dt;
    if (this.moteTimer <= 0) {
      this.moteTimer = 0.09;
      const a = Math.random() * Math.PI * 2;
      const d = 4 + Math.random() * 18;
      const c: RGB = arena.theme.outdoor ? [0.8, 0.45, 0.9] : [arena.theme.torch[0] * 0.8, arena.theme.torch[1] * 0.8, arena.theme.torch[2] * 0.8];
      vfx.burst(x + Math.sin(a) * d, 0.5 + Math.random() * 4, z + Math.cos(a) * d, 1, c, { speed: 0.3, life: 3.5, up: 0.25, size: 0.055, drag: 0.1 });
    }
  }

  // ---------------------------------------------------------------- automation hooks

  /** Compact state for automated checks. */
  debugState(): unknown {
    const latest = this.frames[this.frames.length - 1];
    return {
      id: this.myId,
      phase: this.lobby?.phase,
      world: this.info,
      panel: this.menus.panel,
      selecting: this.select.visible,
      shownHero: this.select.shown,
      sheet: this.sheet.isOpen,
      fps: Math.round(this.fps),
      rtt: Math.round(this.rtt),
      lock: this.lockId,
      pending: this.pending.length,
      me: this.me && { x: this.me.x, z: this.me.z, yaw: this.me.yaw, act: this.me.act, hp: this.me.hp, stamina: this.me.stamina, ult: this.me.ult, fury: this.me.fury },
      players: latest?.s.p.map((p) => ({ id: p.id, hero: p.hero, x: p.x, z: p.z, hp: p.hp, act: p.act })),
      enemies: latest ? [...latest.enemies.values()].map((e) => ({ id: e.id, type: e.type, x: e.x, z: e.z, hp: e.hp, state: e.state, poise: e.poise, st: e.st })) : [],
      pois: this.layout?.pois.map((p, i) => ({ ...p, state: latest?.s.poi[i] ?? 0 })),
      npcs: this.layout?.npcs,
      table: this.layout?.table,
      left: latest?.s.left,
      syn: latest?.s.syn,
      flood: this.flood,
      satchel: this.satchel,
      profile: this.profile,
      drops: this.drops.size,
      pings: this.pings.length,
      vote: this.lobby?.vote,
      run: this.lobby?.run,
      report: this.lobby?.report,
      camYaw: this.cam.yaw,
      aim: this.aim,
    };
  }

  debugLook(yaw: number): void {
    this.cam.yaw = yaw;
  }

  debugSend(msg: ClientMsg): void {
    this.send(msg);
  }

  debugLock(): void {
    this.input.pressLock();
  }
}

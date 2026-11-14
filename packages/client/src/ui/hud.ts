import {
  Act,
  HEROES,
  PS,
  RARITY_COLORS,
  TICK_HZ,
  getItem,
  xpProgress,
  type HeroDef,
  type HeroInventory,
  type PlayerState,
} from '@malampu/shared';
import { h, portrait } from './dom';

export interface PartyEntry {
  id: string;
  name: string;
  hero: HeroDef;
  hp: number;
  maxHp: number;
  downed: boolean;
}

interface Bar {
  root: HTMLElement;
  hp: HTMLElement;
  poise: HTMLElement;
  tag: HTMLElement;
  used: boolean;
}

interface Tag {
  root: HTMLElement;
  used: boolean;
  text: string;
}

const STATUS_LABEL: Record<number, [string, string]> = {
  [PS.Regen]: ['Ristoro', 'good'],
  [PS.DmgUp]: ['Armonia', 'good'],
  [PS.Haste]: ['Rapidità', 'good'],
  [PS.Guard]: ['Baluardo', 'good'],
  [PS.Stealth]: ["Passo d'Ombra", 'good'],
  [PS.Wolf]: ['Licantropo', 'power'],
  [PS.Berserk]: ['Furia', 'power'],
  [PS.Silence]: ['Silenzio', 'bad'],
  [PS.Slow]: ['Rallentato', 'bad'],
  [PS.Cramp]: ['Crampi', 'bad'],
  [PS.Counter]: ['Contrattacco', 'power'],
  [PS.Bubble]: ['Bolla sonora', 'good'],
};

export class Hud {
  readonly root: HTMLElement;
  private readonly stageTitle = h('div', { class: 'stage-title' });
  private readonly waveText = h('div', { class: 'stage-wave' });
  private readonly boss = h('div', { class: 'boss hidden' });
  private readonly bossName = h('div', { class: 'boss-name' });
  private readonly bossHp = h('i');
  private readonly bossPoise = h('i');
  private readonly party = h('div', { class: 'party' });
  private readonly me = h('div', { class: 'me hidden' });
  private readonly meName = h('div', { class: 'me-name' });
  private readonly mePortrait = h('div', { class: 'me-portrait' });
  private readonly hpFill = h('i');
  private readonly hpLag = h('i', { class: 'lag' });
  private readonly hpText = h('span');
  private readonly stFill = h('i');
  private readonly ultFill = h('i');
  private readonly ultBox = h('div', { class: 'skill ult' });
  private readonly abilityBox = h('div', { class: 'skill' });
  private readonly abilityCd = h('b');
  private readonly abilityName = h('span');
  private readonly ultName = h('span');
  private readonly statuses = h('div', { class: 'statuses' });
  private readonly calloutBox = h('div', { class: 'callouts' });
  private readonly promptBox = h('div', { class: 'prompt hidden' });
  private readonly dialog = h('div', { class: 'dialog hidden' });
  private readonly dialogWho = h('b');
  private readonly dialogText = h('span');
  private readonly hintBox = h('div', { class: 'hint hidden' });
  private readonly bannerBox = h('div', { class: 'banner hidden' });
  private readonly bannerTitle = h('div', { class: 'banner-title' });
  private readonly bannerSub = h('div', { class: 'banner-sub' });
  private readonly room = h('div', { class: 'room' });
  private readonly world = h('div', { class: 'world-layer' });
  private readonly reticleEl = h('div', { class: 'reticle hidden' });
  private readonly vignette = h('div', { class: 'vignette' });
  private readonly downedBox = h('div', { class: 'downed hidden' });
  private readonly chargeBox = h('div', { class: 'charge hidden' }, h('i'));
  private readonly comboBox = h('div', { class: 'combo hidden' });
  private readonly xpBar = h('div', { class: 'xp-top' });
  private readonly xpFill = h('i');
  private readonly xpLabel = h('span', { class: 'xp-label' });
  private readonly belt = h('div', { class: 'belt' });
  private readonly lootToasts = h('div', { class: 'loot-toasts' });
  private readonly levelCards = h('div', { class: 'level-cards hidden' });
  private readonly sheetBtn = h('button', { class: 'sheet-btn', text: 'I · Scheda' });
  private readonly bars = new Map<number, Bar>();
  private readonly tags = new Map<string, Tag>();
  private readonly lines: { who: string; text: string }[] = [];
  private lineTimer = 0;
  private hintTimer = 0;
  private bannerTimer = 0;
  private lagHp = 1;
  private combo = 0;
  private comboTimer = 0;
  private lastStatusKey = '';
  private lastPartyKey = '';
  private promptText = '';
  private xpFlash = 0;
  onOpenSheet: () => void = () => {};
  onPickCard: (index: number) => void = () => {};
  onUseBelt: (slot: number) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = h('div', { class: 'hud hidden' });
    this.xpBar.append(this.xpFill, this.xpLabel);
    this.boss.append(this.bossName, h('div', { class: 'bar boss-hp' }, this.bossHp), h('div', { class: 'bar boss-poise' }, this.bossPoise));
    this.dialog.append(this.dialogWho, this.dialogText);
    this.bannerBox.append(this.bannerTitle, this.bannerSub);
    this.abilityBox.append(h('kbd', { text: 'E' }), this.abilityName, this.abilityCd);
    this.ultBox.append(h('kbd', { text: 'R' }), this.ultName, h('div', { class: 'bar ult-bar' }, this.ultFill));
    this.sheetBtn.addEventListener('click', () => this.onOpenSheet());
    this.me.append(
      this.mePortrait,
      h(
        'div',
        { class: 'me-main' },
        this.meName,
        h('div', { class: 'bar hp' }, this.hpLag, this.hpFill, this.hpText),
        h('div', { class: 'bar stamina' }, this.stFill),
        h('div', { class: 'skills' }, this.belt, this.abilityBox, this.ultBox),
      ),
    );
    this.root.append(
      this.vignette,
      this.world,
      this.reticleEl,
      this.xpBar,
      h('div', { class: 'top' }, h('div', { class: 'stage' }, this.stageTitle, this.waveText), this.boss),
      this.party,
      this.me,
      this.statuses,
      this.calloutBox,
      this.lootToasts,
      this.levelCards,
      this.sheetBtn,
      this.comboBox,
      this.chargeBox,
      this.promptBox,
      this.hintBox,
      this.dialog,
      this.bannerBox,
      this.room,
      this.downedBox,
    );
    parent.append(this.root);
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
  }

  // ---------------------------------------------------------------- own hero

  setHero(hero: HeroDef | null, name: string): void {
    this.me.classList.toggle('hidden', !hero);
    if (!hero) return;
    this.meName.textContent = `${hero.short} · ${name}`;
    this.mePortrait.replaceChildren(portrait(hero.id, hero.color, hero.code));
    this.me.style.setProperty('--c', hero.color);
    this.abilityName.textContent = hero.ability.name;
    this.ultName.textContent = hero.ult.name;
    this.abilityBox.title = hero.ability.desc;
    this.ultBox.title = hero.ult.desc;
    this.lagHp = 1;
  }

  updateMe(p: PlayerState, dt: number): void {
    const hero = HEROES[p.hero];
    const hp = Math.max(0, p.hp / (p.maxHp || hero.hp));
    if (hp >= this.lagHp) this.lagHp = hp;
    else this.lagHp = Math.max(hp, this.lagHp - dt * 0.35);
    this.hpFill.style.transform = `scaleX(${hp})`;
    this.hpLag.style.transform = `scaleX(${this.lagHp})`;
    this.hpText.textContent = `${Math.ceil(Math.max(0, p.hp))} / ${Math.ceil(p.maxHp || hero.hp)}`;
    this.stFill.style.transform = `scaleX(${Math.max(0, p.stamina / (p.maxStamina || hero.stamina))})`;
    this.stFill.classList.toggle('low', p.stamina < hero.dodge.cost);
    const tp = hero.dodge.teleport;
    const teleportReady = !!tp && p.dodgeCd <= 0 && p.stamina >= tp.cost;
    this.stFill.classList.toggle('charged', teleportReady || hero.dodge.kind === 'blink');
    this.ultFill.style.transform = `scaleX(${Math.min(1, p.ult / 100)})`;
    this.ultBox.classList.toggle('ready', p.ult >= 100);
    const cd = p.cd / TICK_HZ;
    this.abilityBox.classList.toggle('ready', cd <= 0);
    this.abilityCd.textContent = cd > 0 ? cd.toFixed(cd < 3 ? 1 : 0) : '';
    const silenced = p.st.some((s) => s.k === PS.Silence) && !p.st.some((s) => s.k === PS.Bubble);
    this.abilityBox.classList.toggle('silenced', silenced);
    this.ultBox.classList.toggle('silenced', silenced);
    this.vignette.classList.toggle('low', hp < 0.3 && p.act !== Act.Downed);
    this.vignette.classList.toggle('silenced', silenced);

    const key = p.st.map((s) => s.k).join(',');
    if (key !== this.lastStatusKey) {
      this.lastStatusKey = key;
      this.statuses.replaceChildren(
        ...p.st
          .filter((s) => STATUS_LABEL[s.k])
          .map((s) => h('div', { class: `status ${STATUS_LABEL[s.k]![1]}`, text: STATUS_LABEL[s.k]![0] })),
      );
    }

    const charging = p.act === Act.Charge;
    this.chargeBox.classList.toggle('hidden', !charging);
    if (charging) {
      const u = Math.min(1, p.t / TICK_HZ / 0.9);
      (this.chargeBox.firstChild as HTMLElement).style.transform = `scaleX(${u})`;
      this.chargeBox.classList.toggle('full', u >= 1);
    }
  }

  setParty(list: PartyEntry[]): void {
    const key = list.map((e) => `${e.id}:${e.name}:${e.hero.id}`).join('|');
    if (key !== this.lastPartyKey) {
      this.lastPartyKey = key;
      this.party.replaceChildren(
        ...list.map((e) =>
          h(
            'div',
            { class: 'ally', style: `--c:${e.hero.color}` },
            portrait(e.hero.id, e.hero.color, e.hero.code, 'small'),
            h('div', { class: 'ally-main' }, h('div', { class: 'ally-name', text: `${e.hero.short} · ${e.name}` }), h('div', { class: 'bar hp' }, h('i'))),
          ),
        ),
      );
    }
    list.forEach((e, i) => {
      const el = this.party.children[i] as HTMLElement | undefined;
      if (!el) return;
      el.classList.toggle('is-down', e.downed);
      const fill = el.querySelector('i') as HTMLElement;
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, e.hp / (e.maxHp || e.hero.hp)))})`;
    });
  }

  // ---------------------------------------------------------------- stage

  setStage(title: string, wave: string): void {
    if (this.stageTitle.textContent !== title) this.stageTitle.textContent = title;
    if (this.waveText.textContent !== wave) this.waveText.textContent = wave;
  }

  setBoss(name: string | null, hp = 0, poise = 0, broken = false): void {
    this.boss.classList.toggle('hidden', !name);
    if (!name) return;
    if (this.bossName.textContent !== name) this.bossName.textContent = name;
    this.bossHp.style.transform = `scaleX(${Math.max(0, Math.min(1, hp))})`;
    this.bossPoise.style.transform = `scaleX(${Math.max(0, Math.min(1, poise))})`;
    this.boss.classList.toggle('broken', broken);
  }

  setRoom(text: string): void {
    if (this.room.textContent !== text) this.room.textContent = text;
  }

  banner(title: string, sub = '', secs = 3.2): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerBox.classList.remove('hidden');
    this.bannerBox.classList.remove('show');
    void this.bannerBox.offsetWidth;
    this.bannerBox.classList.add('show');
    this.bannerTimer = secs;
  }

  say(who: string, text: string): void {
    this.lines.push({ who, text });
  }

  hint(text: string): void {
    this.hintBox.textContent = text;
    this.hintBox.classList.remove('hidden');
    this.hintTimer = 11;
  }

  clearTexts(): void {
    this.lines.length = 0;
    this.lineTimer = 0;
    this.hintTimer = 0;
    this.dialog.classList.add('hidden');
    this.hintBox.classList.add('hidden');
  }

  prompt(text: string | null): void {
    const t = text ?? '';
    if (t === this.promptText) return;
    this.promptText = t;
    this.promptBox.classList.toggle('hidden', !t);
    if (!t) return;
    // "F" style key hints are written as [F] in the text.
    const parts = t.split(/(\[[^\]]+\])/).filter(Boolean);
    this.promptBox.replaceChildren(...parts.map((s) => (s.startsWith('[') ? h('kbd', { text: s.slice(1, -1) }) : h('span', { text: s }))));
  }

  setDowned(text: string | null): void {
    this.downedBox.classList.toggle('hidden', !text);
    if (text && this.downedBox.textContent !== text) this.downedBox.textContent = text;
  }

  callout(text: string, cls = ''): void {
    const el = h('div', { class: `callout ${cls}`, text });
    el.addEventListener('animationend', () => el.remove());
    this.calloutBox.append(el);
    while (this.calloutBox.children.length > 3) this.calloutBox.firstChild?.remove();
  }

  hitCombo(): void {
    this.combo++;
    this.comboTimer = 2.2;
    if (this.combo < 3) return;
    this.comboBox.textContent = `${this.combo} colpi`;
    this.comboBox.classList.remove('hidden', 'pop');
    void this.comboBox.offsetWidth;
    this.comboBox.classList.add('pop');
  }

  breakCombo(): void {
    this.combo = 0;
    this.comboBox.classList.add('hidden');
  }

  damageFlash(red: boolean): void {
    this.vignette.classList.remove('hurt', 'hurt-red');
    void this.vignette.offsetWidth;
    this.vignette.classList.add(red ? 'hurt-red' : 'hurt');
  }

  // ---------------------------------------------------------------- world-anchored elements

  beginFrame(): void {
    for (const b of this.bars.values()) b.used = false;
    for (const t of this.tags.values()) t.used = false;
  }

  enemyBar(id: number, x: number, y: number, hp: number, poise: number, cls: string, label: string): void {
    let b = this.bars.get(id);
    if (!b) {
      const hpEl = h('i');
      const poiseEl = h('i');
      const tag = h('div', { class: 'ebar-tag' });
      const root = h('div', { class: 'ebar' }, tag, h('div', { class: 'bar ehp' }, hpEl), h('div', { class: 'bar epoise' }, poiseEl));
      b = { root, hp: hpEl, poise: poiseEl, tag, used: true };
      this.bars.set(id, b);
      this.world.append(root);
    }
    b.used = true;
    b.root.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    b.root.className = `ebar ${cls}`;
    b.hp.style.transform = `scaleX(${Math.max(0, Math.min(1, hp))})`;
    b.poise.style.transform = `scaleX(${Math.max(0, Math.min(1, poise))})`;
    if (b.tag.textContent !== label) b.tag.textContent = label;
  }

  nameTag(id: string, x: number, y: number, text: string, color: string, cls = ''): void {
    let t = this.tags.get(id);
    if (!t) {
      t = { root: h('div', { class: 'ntag' }), used: true, text: '' };
      this.tags.set(id, t);
      this.world.append(t.root);
    }
    t.used = true;
    t.root.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
    t.root.className = `ntag ${cls}`;
    if (t.text !== text) {
      t.text = text;
      t.root.textContent = text;
      t.root.style.setProperty('--c', color);
    }
  }

  endFrame(): void {
    for (const [id, b] of this.bars) {
      if (b.used) continue;
      b.root.remove();
      this.bars.delete(id);
    }
    for (const [id, t] of this.tags) {
      if (t.used) continue;
      t.root.remove();
      this.tags.delete(id);
    }
  }

  reticle(x: number, y: number, on: boolean): void {
    this.reticleEl.classList.toggle('hidden', !on);
    if (on) this.reticleEl.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }

  floater(x: number, y: number, text: string, cls = ''): void {
    const el = h('div', { class: `floater ${cls}`, text });
    el.style.left = `${Math.round(x + (Math.random() - 0.5) * 36)}px`;
    el.style.top = `${Math.round(y + (Math.random() - 0.5) * 16)}px`;
    el.addEventListener('animationend', () => el.remove());
    this.world.append(el);
  }

  setXp(pe: number, flash = false): void {
    const p = xpProgress(pe);
    const frac = p.need > 0 ? p.into / p.need : 1;
    this.xpFill.style.transform = `scaleX(${Math.max(0, Math.min(1, frac))})`;
    this.xpLabel.textContent = `LIV. ${p.level} · ${p.into} / ${p.need || 'MAX'} PE`;
    if (flash) {
      this.xpFlash = 0.45;
      this.xpBar.classList.add('flash');
    }
  }

  setBelt(inv: HeroInventory | null): void {
    if (!inv) {
      this.belt.replaceChildren();
      return;
    }
    this.belt.replaceChildren(
      ...inv.belt.map((slot, i) => {
        const def = slot ? getItem(slot.itemId) : null;
        const el = h(
          'div',
          {
            class: `belt-slot${slot ? '' : ' empty'}`,
            title: def?.name ?? `Slot ${i + 1}`,
            onclick: () => this.onUseBelt(i),
          },
          h('kbd', { text: String(i + 1) }),
          h('span', { text: slot ? `×${slot.qty}` : '' }),
        );
        if (def) el.style.setProperty('--r', RARITY_COLORS[def.rarity]);
        return el;
      }),
    );
  }

  lootToast(text: string, rarity?: string): void {
    const el = h('div', {
      class: 'loot-toast',
      text,
      style: rarity ? `border-color:${rarity}` : undefined,
    });
    el.addEventListener('animationend', () => el.remove());
    this.lootToasts.append(el);
    while (this.lootToasts.children.length > 4) this.lootToasts.firstChild?.remove();
  }

  showLevelCards(cards: { name: string; desc: string }[]): void {
    if (!cards.length) {
      this.levelCards.classList.add('hidden');
      this.levelCards.replaceChildren();
      return;
    }
    this.levelCards.classList.remove('hidden');
    this.levelCards.replaceChildren(
      h('div', {
        class: 'level-cards-title',
        text: document.documentElement.classList.contains('touch-mode')
          ? 'Potenziamento rapido — tocca una carta'
          : 'Potenziamento Rapido — premi 1 · 2 · 3',
      }),
      ...cards.map((c, i) =>
        h(
          'button',
          {
            class: 'level-card',
            onclick: () => this.onPickCard(i),
          },
          h('kbd', { text: String(i + 1) }),
          h('b', { text: c.name }),
          h('span', { text: c.desc }),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- frame

  update(dt: number): void {
    if (this.xpFlash > 0) {
      this.xpFlash -= dt;
      if (this.xpFlash <= 0) this.xpBar.classList.remove('flash');
    }
    if (this.lineTimer > 0) {
      this.lineTimer -= dt;
      if (this.lineTimer <= 0) this.dialog.classList.add('hidden');
    }
    if (this.lineTimer <= 0 && this.lines.length > 0) {
      const line = this.lines.shift()!;
      this.dialogWho.textContent = line.who;
      this.dialogText.textContent = line.text;
      this.dialog.classList.remove('hidden');
      this.lineTimer = Math.min(8, 2.6 + line.text.length * 0.045);
      // Do not let a long queue fall far behind the action.
      if (this.lines.length > 2) this.lineTimer *= 0.6;
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.hintBox.classList.add('hidden');
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerBox.classList.add('hidden');
    }
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.breakCombo();
    }
  }
}

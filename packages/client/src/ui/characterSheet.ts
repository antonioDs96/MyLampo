/**
 * Unified D&D 5.2.1 character sheet + inventory modal (I / P).
 */
import {
  ABILITY_IDS,
  ABILITY_LABELS,
  computeHeroStats,
  HERO_DND_PROFILES,
  HEROES,
  MASTERY_LABELS,
  RARITY_COLORS,
  RARITY_LABELS,
  SRD_LEGAL_FOOTER,
  compareItems,
  getItem,
  xpProgress,
  type AbilityId,
  type HeroId,
  type HeroInventory,
  type ItemDef,
  type ItemInstance,
  type MasteryId,
} from '@malampu/shared';
import { h } from './dom';

export type SheetAction =
  | { t: 'equip'; uid: string }
  | { t: 'salvage'; uid: string }
  | { t: 'belt'; uid: string; slot: number }
  | { t: 'asi'; ability: AbilityId }
  | { t: 'useBelt'; slot: number }
  | { t: 'close' };

export class CharacterSheet {
  readonly root: HTMLElement;
  private readonly body = h('div', { class: 'sheet-body' });
  private open = false;
  private inv: HeroInventory | null = null;
  private heroId: HeroId | null = null;
  onAction: (a: SheetAction) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = h(
      'div',
      { class: 'sheet-modal hidden' },
      h(
        'div',
        { class: 'sheet-panel' },
        h(
          'div',
          { class: 'sheet-head' },
          h('div', { class: 'sheet-title', text: "Scheda dell'Eroe & Inventario" }),
          h('button', {
            class: 'sheet-close',
            text: '✕',
            onclick: () => this.onAction({ t: 'close' }),
          }),
        ),
        this.body,
        h('div', { class: 'sheet-legal', text: SRD_LEGAL_FOOTER }),
      ),
    );
    // Allow clicking inside
    this.root.style.pointerEvents = 'auto';
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setVisible(on: boolean): void {
    this.open = on;
    this.root.classList.toggle('hidden', !on);
  }

  toggle(): void {
    this.setVisible(!this.open);
  }

  render(heroId: HeroId, inv: HeroInventory): void {
    this.heroId = heroId;
    this.inv = inv;
    const hero = HEROES[heroId];
    const profile = HERO_DND_PROFILES[heroId];
    const xp = xpProgress(inv.pe);
    const live = computeHeroStats(
      heroId,
      xp.level,
      {
        mainHand: inv.mainHand,
        offHand: inv.offHand,
        armor: inv.armor,
        relic: inv.relic,
        belt: inv.belt,
      },
      [],
      inv.tomes,
      { baseHp: hero.hp, baseStamina: hero.stamina, asiSpends: inv.asiSpends },
    );

    const left = h(
      'div',
      { class: 'sheet-col sheet-dnd' },
      h('div', { class: 'sheet-hero-name', text: hero.name }),
      h('div', { class: 'sheet-sub', text: `${profile.species} · ${profile.clazz}` }),
      h(
        'div',
        { class: 'sheet-meta' },
        meta('Livello', String(xp.level)),
        meta('PE', `${xp.into} / ${xp.need || '—'} (${xp.total})`),
        meta('Competenza', `+${live.proficiency}`),
        meta('CA', String(live.ac)),
        meta('Iniziativa', signed(live.initiative)),
        meta('Velocità', `${(hero.speed * live.moveSpeedMul).toFixed(1)} m/s`),
        meta('Dado Vita', `d${live.hitDie}`),
        meta('Percezione', String(live.passivePerception)),
      ),
      h('div', { class: 'sheet-section', text: 'Caratteristiche' }),
      h(
        'div',
        { class: 'sheet-abilities' },
        ...ABILITY_IDS.map((id) => abilityRow(id, live.scores[id]!, live.mods[id]!, inv.asiPoints > 0, () => this.onAction({ t: 'asi', ability: id }))),
      ),
      inv.asiPoints > 0
        ? h('div', { class: 'sheet-asi', text: `Punti Aumento Caratteristica: ${inv.asiPoints}` })
        : null,
      h('div', { class: 'sheet-section', text: 'Tiri Salvezza' }),
      h('div', { class: 'sheet-list', text: profile.saveProf.map((s) => `${s} ${signed(live.mods[s]! + live.proficiency)}`).join(' · ') }),
      h('div', { class: 'sheet-section', text: 'Abilità / Maestria' }),
      h(
        'div',
        { class: 'sheet-list', text: profile.skills.map((s) => (profile.mastery.includes(s) ? `★ ${s}` : s)).join(', ') },
      ),
      h('div', { class: 'sheet-section', text: 'Note' }),
      h('div', { class: 'sheet-list', text: profile.notes }),
    );

    const masteryLabel =
      live.mastery && MASTERY_LABELS[live.mastery as MasteryId]
        ? MASTERY_LABELS[live.mastery as MasteryId].name
        : '—';

    const mid = h(
      'div',
      { class: 'sheet-col sheet-equip' },
      h('div', { class: 'sheet-section', text: 'Equipaggiamento' }),
      slotCard('Arma Principale', inv.mainHand),
      slotCard('Mano Secondaria / Scudo', inv.offHand),
      slotCard('Armatura', inv.armor),
      slotCard('Monile / Reliquia', inv.relic),
      h('div', { class: 'sheet-section', text: 'Cintura Consumabili' }),
      h(
        'div',
        { class: 'sheet-belt' },
        ...inv.belt.map((b, i) =>
          h(
            'div',
            {
              class: 'sheet-belt-slot',
              onclick: () => this.onAction({ t: 'useBelt', slot: i }),
              title: b ? getItem(b.itemId)?.name : `Slot ${i + 1}`,
            },
            h('kbd', { text: String(i + 1) }),
            h('span', { text: b ? `${getItem(b.itemId)?.name ?? '?'} ×${b.qty}` : '—' }),
          ),
        ),
      ),
      h('div', { class: 'sheet-section', text: 'Statistiche Arcade (Megabonk)' }),
      h(
        'div',
        { class: 'sheet-arcade' },
        meta('Danno J', `×${live.lightDmgMul.toFixed(2)}`),
        meta('Danno K', `×${live.heavyDmgMul.toFixed(2)}`),
        meta('Padronanza', masteryLabel),
        meta('Attack Speed', `${Math.round((live.attackSpeedMul - 1) * 100)}%`),
        meta('Area Size', `${Math.round((live.areaMul - 1) * 100)}%`),
        meta('Knockback', `${Math.round((live.knockbackMul - 1) * 100)}%`),
        meta('Postura', `${Math.round((live.postureMul - 1) * 100)}%`),
        meta('Magnete', `${live.pickupRadius.toFixed(1)} m`),
      ),
      inv.tomes.length
        ? h('div', { class: 'sheet-tomes', text: `Tomi: ${inv.tomes.join(', ')}` })
        : null,
    );

    const right = h(
      'div',
      { class: 'sheet-col sheet-bag' },
      h('div', { class: 'sheet-gold', text: `${inv.gold} mo` }),
      h('div', { class: 'sheet-section', text: 'Zaino' }),
      h(
        'div',
        { class: 'sheet-grid' },
        ...inv.bag.map((inst) => this.bagCell(inst, inv)),
        inv.bag.length === 0 ? h('div', { class: 'sheet-empty', text: 'Nessun oggetto raccolto.' }) : null,
      ),
    );

    this.body.replaceChildren(left, mid, right);
  }

  private bagCell(inst: ItemInstance, inv: HeroInventory): HTMLElement {
    const def = getItem(inst.itemId);
    if (!def) return h('div', { class: 'sheet-item' });
    const equipped = equippedOfKind(inv, def);
    const cmp = compareItems(def, equipped);
    const tip = [
      def.name,
      RARITY_LABELS[def.rarity],
      def.desc,
      ...cmp.map((c) => `${c.label}: ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)}`),
    ].join('\n');
    return h(
      'div',
      {
        class: 'sheet-item',
        style: `border-color:${RARITY_COLORS[def.rarity]}`,
        title: tip,
      },
      h('div', { class: 'sheet-item-name', text: def.name }),
      h('div', { class: 'sheet-item-rarity', style: `color:${RARITY_COLORS[def.rarity]}`, text: RARITY_LABELS[def.rarity] }),
      h(
        'div',
        { class: 'sheet-item-cmp' },
        ...cmp.map((c) =>
          h('span', {
            class: c.better === true ? 'up' : c.better === false ? 'down' : '',
            text: `${c.label} ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(1)}`,
          }),
        ),
      ),
      h(
        'div',
        { class: 'sheet-item-actions' },
        def.kind === 'consumable' || def.belt
          ? h('button', {
              text: 'Slot 1',
              onclick: () => this.onAction({ t: 'belt', uid: inst.uid, slot: 0 }),
            })
          : h('button', {
              text: 'Equipaggia',
              onclick: () => this.onAction({ t: 'equip', uid: inst.uid }),
            }),
        h('button', {
          text: 'Vendi',
          onclick: () => this.onAction({ t: 'salvage', uid: inst.uid }),
        }),
      ),
    );
  }
}

function meta(k: string, v: string): HTMLElement {
  return h('div', { class: 'sheet-kv' }, h('span', { text: k }), h('b', { text: v }));
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : String(n);
}

function abilityRow(id: AbilityId, score: number, mod: number, canSpend: boolean, onPlus: () => void): HTMLElement {
  return h(
    'div',
    { class: 'sheet-ability' },
    h('div', { class: 'sheet-ability-id', text: id }),
    h('div', { class: 'sheet-ability-name', text: ABILITY_LABELS[id] }),
    h('div', { class: 'sheet-ability-score', text: String(score) }),
    h('div', { class: 'sheet-ability-mod', text: signed(mod) }),
    canSpend
      ? h('button', { class: 'sheet-plus', text: '+', onclick: onPlus, title: 'Spendi punto ASI' })
      : h('span', { class: 'sheet-plus off', text: '+' }),
  );
}

function slotCard(label: string, inst: ItemInstance | null): HTMLElement {
  const def = inst ? getItem(inst.itemId) : null;
  return h(
    'div',
    { class: 'sheet-slot' },
    h('div', { class: 'sheet-slot-label', text: label }),
    h('div', {
      class: 'sheet-slot-value',
      style: def ? `color:${RARITY_COLORS[def.rarity]}` : undefined,
      text: def ? def.name : '— vuoto —',
    }),
  );
}

function equippedOfKind(inv: HeroInventory, def: ItemDef): ItemDef | null {
  const pick = (inst: ItemInstance | null) => (inst ? getItem(inst.itemId) ?? null : null);
  if (def.kind === 'weapon') return pick(inv.mainHand);
  if (def.kind === 'shield') return pick(inv.offHand);
  if (def.kind === 'armor') return pick(inv.armor);
  if (def.kind === 'relic') return pick(inv.relic);
  return null;
}

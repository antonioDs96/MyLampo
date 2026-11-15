/**
 * Hero sheet + inventory: arcade roster stats, gear, bag.
 */
import {
  ARCADE_KITS,
  HEROES,
  MASTERY_LABELS,
  RARITY_COLORS,
  RARITY_LABELS,
  compareItems,
  computeHeroStats,
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
      ),
    );
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
    const kit = ARCADE_KITS[heroId];
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

    const resourceLabel = kit.resourceKind === 'mana' ? 'Mana' : 'Vigore';

    const left = h(
      'div',
      { class: 'sheet-col sheet-arcade-kit' },
      h('div', { class: 'sheet-hero-name', text: hero.name }),
      h('div', { class: 'sheet-sub', text: hero.role }),
      h(
        'div',
        { class: 'sheet-meta' },
        meta('Livello', String(xp.level)),
        meta('PE', `${xp.into} / ${xp.need || '—'} (${xp.total})`),
        meta('Vita', String(kit.hp)),
        meta(resourceLabel, String(kit.resource)),
        meta('Armatura', String(kit.armor)),
        meta('Danno Fisico', String(kit.phys)),
        meta('Danno Speciale', String(kit.special)),
        meta('Velocità', `${kit.movePct}%`),
        meta('Vel. Attacco', `${kit.attackMul.toFixed(1)}×`),
        meta('Crit %', `${kit.critChance}%`),
        meta('Crit Mult', `${kit.critMult.toFixed(1)}×`),
        meta('Area', String(kit.area)),
        meta('Knockback', String(kit.knockback)),
      ),
      h('div', { class: 'sheet-section', text: 'Passiva' }),
      h('div', { class: 'sheet-list', text: hero.passive }),
      h('div', { class: 'sheet-section', text: 'Abilità' }),
      h('div', { class: 'sheet-list', text: `${hero.ability.name} — ${hero.ability.desc}` }),
      h('div', { class: 'sheet-section', text: 'Suprema' }),
      h('div', { class: 'sheet-list', text: `${hero.ult.name} — ${hero.ult.desc}` }),
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
      h('div', { class: 'sheet-section', text: 'Bonus da Equip / Run' }),
      h(
        'div',
        { class: 'sheet-arcade' },
        meta('Danno J', `×${live.lightDmgMul.toFixed(2)}`),
        meta('Danno K', `×${live.heavyDmgMul.toFixed(2)}`),
        meta('Padronanza', masteryLabel),
        meta('Attack Speed', pct(live.attackSpeedMul)),
        meta('Area Size', pct(live.areaMul)),
        meta('Knockback', pct(live.knockbackMul)),
        meta('Postura', pct(live.postureMul)),
        meta('Magnete', `${live.pickupRadius.toFixed(1)} m`),
      ),
      inv.tomes.length ? h('div', { class: 'sheet-tomes', text: `Tomi: ${inv.tomes.join(', ')}` }) : null,
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

function pct(mul: number): string {
  return `${Math.round((mul - 1) * 100)}%`;
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

import {
  ABILITY_SLOTS,
  COSMETIC_BY_ID,
  HEROES,
  abilityTooltip,
  heroStatLines,
  loadoutOf,
  treeOf,
  type AbilitySlot,
  type HeroId,
  type Profile,
} from '@malampu/shared';
import { h } from './dom';

/**
 * The Hero Sheet [I]: a read-only holographic panel. Fixed base stats, the cosmetics worn
 * and what the Special and the Ultimate do right now. There is nothing to manage here:
 * no inventory, no weight, no equipment, no consumables.
 */
export class HeroSheet {
  isOpen = false;
  onClose: () => void = () => {};
  private readonly root = h('div', { class: 'hero-sheet hidden' });
  private readonly panel = h('div', { class: 'holo' });

  constructor(parent: HTMLElement) {
    this.root.append(this.panel);
    parent.append(this.root);
  }

  setVisible(on: boolean): void {
    this.isOpen = on;
    this.root.classList.toggle('hidden', !on);
  }

  render(hero: HeroId, profile: Profile, name: string): void {
    const def = HEROES[hero];
    const tree = treeOf(profile, hero);
    const look = loadoutOf(profile, hero);
    const worn = (id: string): string => (id ? (COSMETIC_BY_ID[id]?.name ?? 'Base') : 'Base');
    const title = profile.title ? COSMETIC_BY_ID[profile.title]?.text : '';

    const stats = heroStatLines(hero).map((line) =>
      h('div', { class: 'holo-stat' }, h('span', { class: 'holo-stat-label', text: line.label }), h('b', { text: line.value }), h('small', { text: line.note })),
    );

    const ability = (slot: AbilitySlot): HTMLElement => {
      const tip = abilityTooltip(hero, slot, tree);
      const numbers: [string, string][] = [
        ['Danno base', tip.damage ? String(tip.damage) : '—'],
        ['Ricarica', `${tip.cooldown} s`],
        ['Area', tip.aoeCells ? `${tip.aoeCells} celle` : '—'],
        ['Gittata', tip.rangeCells ? `${tip.rangeCells} celle` : 'Sull’eroe'],
      ];
      if (tip.tick) numbers.push(['Danno periodico', String(tip.tick)]);
      if (tip.healPct) numbers.push(['Cura', `${tip.healPct}% della Vita`]);
      return h(
        'section',
        { class: `holo-ability slot-${slot}` },
        h('h4', {}, h('kbd', { text: slot === 'e' ? 'E' : 'R' }), ` ${slot === 'e' ? 'Speciale' : 'Ultimate'} · ${tip.name}`),
        h('p', { text: tip.desc }),
        h('div', { class: 'holo-numbers' }, ...numbers.map(([k, v]) => h('div', {}, h('span', { text: k }), h('b', { text: v })))),
        tip.effect ? h('p', { class: 'holo-effect', text: tip.effect }) : null,
        h('ul', { class: 'holo-recap' }, ...tip.recap.map((line) => h('li', { text: line }))),
      );
    };

    this.root.style.setProperty('--c', def.color);
    this.panel.replaceChildren(
      h(
        'header',
        {},
        h('div', {}, h('h2', { text: def.name }), h('div', { class: 'holo-class', text: `${def.role}${title ? ` · ${title}` : ''}` }), h('div', { class: 'holo-player', text: name })),
        h('button', { class: 'btn ghost small', text: 'Chiudi [I]', onclick: () => this.onClose() }),
      ),
      h(
        'div',
        { class: 'holo-body' },
        h('h3', { text: 'Statistiche di base · fisse' }),
        h('div', { class: 'holo-stats' }, ...stats),
        h('h3', { text: 'Cosmetici equipaggiati' }),
        h(
          'div',
          { class: 'holo-cosmetics' },
          h('div', {}, h('span', { text: 'Skin' }), h('b', { text: worn(look.skin) })),
          h('div', {}, h('span', { text: 'Palette' }), h('b', { text: worn(look.palette) })),
          h('div', {}, h('span', { text: 'Effetti' }), h('b', { text: worn(look.vfx) })),
          h('div', {}, h('span', { text: 'Posa' }), h('b', { text: worn(look.pose) })),
        ),
        h('h3', { text: 'Abilità' }),
        ...ABILITY_SLOTS.map(ability),
        h('p', { class: 'holo-foot', text: 'Sola lettura. I nodi si cambiano da Iej, i cosmetici da Saraya: entrambi in taverna.' }),
      ),
    );
  }
}

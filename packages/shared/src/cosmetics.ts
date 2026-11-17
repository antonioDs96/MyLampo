/**
 * Saraya's atelier. Everything here is purely cosmetic and paid in Fili d'Ombra:
 * nothing in this file may ever touch a combat number.
 */
export type CosmeticKind = 'palette' | 'skin' | 'vfx' | 'pose' | 'title';

export const COSMETIC_KINDS: CosmeticKind[] = ['palette', 'skin', 'vfx', 'pose', 'title'];

export const COSMETIC_KIND_NAMES: Record<CosmeticKind, string> = {
  palette: 'Palette',
  skin: 'Skin',
  vfx: 'Effetti delle abilità',
  pose: 'Pose della Selezione Eroe',
  title: 'Titoli',
};

export interface CosmeticDef {
  id: string;
  kind: CosmeticKind;
  name: string;
  desc: string;
  /** Price in Fili d'Ombra. */
  cost: number;
  /** palette: cloth hue (degrees), saturation and value multipliers. */
  hue?: number;
  sat?: number;
  val?: number;
  /** skin / vfx: colour as r, g, b in 0..1. */
  color?: [number, number, number];
  /** skin: see-through spectral body. */
  alpha?: number;
  /** pose: animation clip held on the Hero Selection screen. */
  clip?: string;
  /** title: text shown under the hero's name. */
  text?: string;
}

export const COSMETICS: CosmeticDef[] = [
  // Palettes: recolour the cloth of any hero.
  { id: 'pal_abisso', kind: 'palette', name: 'Blu Abisso', desc: 'Il colore del fondale di Badiscar.', cost: 12, hue: 212, sat: 0.85, val: 0.7 },
  { id: 'pal_cremisi', kind: 'palette', name: 'Cremisi di Ujian', desc: 'Il rosso delle toghe dei Pesatori.', cost: 12, hue: 352, sat: 0.9, val: 0.75 },
  { id: 'pal_oro', kind: 'palette', name: 'Oro di Mur', desc: 'Filo dorato per casate decadute.', cost: 18, hue: 44, sat: 0.95, val: 1.05 },
  { id: 'pal_smeraldo', kind: 'palette', name: 'Smeraldo del Fiolar', desc: 'Verde dei monoliti sacri.', cost: 12, hue: 150, sat: 0.9, val: 0.72 },
  { id: 'pal_cenere', kind: 'palette', name: "Cenere d'Eclissi", desc: 'Grigio spento, come il cielo sotto il sole nero.', cost: 18, hue: 260, sat: 0.12, val: 0.55 },
  { id: 'pal_corallo', kind: 'palette', name: 'Corallo', desc: 'Rosa vivo delle scogliere a pelo d’acqua.', cost: 12, hue: 12, sat: 0.75, val: 1 },

  // Skins: a different body finish.
  { id: 'skin_spettro', kind: 'skin', name: 'Spettro della Risacca', desc: 'Il corpo si fa traslucido e azzurro.', cost: 45, color: [0.25, 0.6, 0.75], alpha: 0.72 },
  { id: 'skin_eclisse', kind: 'skin', name: "Veste dell'Eclissi", desc: 'Un alone viola che non si spegne mai.', cost: 60, color: [0.42, 0.1, 0.6] },
  { id: 'skin_brace', kind: 'skin', name: 'Brace Viva', desc: 'Bagliori di carbone ardente sotto la stoffa.', cost: 45, color: [0.75, 0.28, 0.05] },
  { id: 'skin_giada', kind: 'skin', name: 'Giada Antica', desc: 'Riflessi verdi di pietra levigata.', cost: 45, color: [0.1, 0.55, 0.3] },

  // VFX recolours: the colour of Special and Ultimate effects.
  { id: 'vfx_viola', kind: 'vfx', name: 'Etere Viola', desc: 'Le abilità brillano di viola.', cost: 25, color: [0.66, 0.33, 0.97] },
  { id: 'vfx_oro', kind: 'vfx', name: 'Luce Dorata', desc: 'Le abilità brillano d’oro.', cost: 25, color: [0.98, 0.8, 0.25] },
  { id: 'vfx_cremisi', kind: 'vfx', name: 'Sangue di Marea', desc: 'Le abilità brillano di rosso cupo.', cost: 25, color: [0.9, 0.16, 0.22] },
  { id: 'vfx_smeraldo', kind: 'vfx', name: 'Fuoco Fatuo', desc: 'Le abilità brillano di verde.', cost: 25, color: [0.2, 0.9, 0.5] },

  // Idle poses for the Hero Selection screen.
  { id: 'pose_trionfo', kind: 'pose', name: 'Trionfo', desc: 'Braccia al cielo.', cost: 20, clip: 'Cheer' },
  { id: 'pose_sfida', kind: 'pose', name: 'Sfida', desc: 'Un gesto che invita a farsi avanti.', cost: 20, clip: '2H_Melee_Idle' },
  { id: 'pose_guardia', kind: 'pose', name: 'In Guardia', desc: 'Pronto a parare.', cost: 20, clip: 'Blocking' },
  { id: 'pose_evocazione', kind: 'pose', name: 'Evocazione', desc: 'Le mani alzate a chiamare qualcosa.', cost: 30, clip: 'Spellcast_Raise' },

  // Titles shown under the name.
  { id: 'title_naufrago', kind: 'title', name: 'il Naufrago', desc: 'Per chi è tornato a riva almeno una volta.', cost: 10, text: 'il Naufrago' },
  { id: 'title_corsari', kind: 'title', name: 'Flagello dei Corsari', desc: 'I moli di Badiscar ricordano.', cost: 30, text: 'Flagello dei Corsari' },
  { id: 'title_taverna', kind: 'title', name: 'Voce della Taverna', desc: 'Carl vi tiene il posto.', cost: 30, text: 'Voce della Taverna' },
  { id: 'title_fervore', kind: 'title', name: 'Mai Voltato Indietro', desc: 'Per chi non salva mai.', cost: 60, text: 'Mai Voltato Indietro' },
  { id: 'title_leviatano', kind: 'title', name: 'Sventra-Leviatani', desc: 'Un titolo che si spiega da solo.', cost: 150, text: 'Sventra-Leviatani' },
];

export const COSMETIC_BY_ID: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

/** What a hero is wearing. Empty string = the default look. */
export interface Loadout {
  palette: string;
  skin: string;
  vfx: string;
  pose: string;
}

export function emptyLoadout(): Loadout {
  return { palette: '', skin: '', vfx: '', pose: '' };
}

export type LoadoutSlot = keyof Loadout;
export const LOADOUT_SLOTS: LoadoutSlot[] = ['palette', 'skin', 'vfx', 'pose'];

/** Keeps only cosmetics that exist, are of the right kind and are owned. */
export function sanitizeLoadout(raw: unknown, owned: readonly string[]): Loadout {
  const out = emptyLoadout();
  if (!raw || typeof raw !== 'object') return out;
  for (const slot of LOADOUT_SLOTS) {
    const id = String((raw as Record<string, unknown>)[slot] ?? '');
    const def = COSMETIC_BY_ID[id];
    if (def && def.kind === slot && owned.includes(id)) out[slot] = id;
  }
  return out;
}

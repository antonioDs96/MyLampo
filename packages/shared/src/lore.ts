/** The voices of La Taverna di Carl. What an NPC says depends on the class of the hero in front of them. */
import { HEROES, type Archetype } from './heroes';
import type { HeroId } from './types';

export type NpcId = 'carl' | 'iej' | 'saraya' | 'eleonora' | 'tavolo';

export interface NpcInfo {
  id: NpcId;
  name: string;
  role: string;
  /** What the interaction prompt offers. */
  prompt: string;
  color: string;
  /** Said to anyone. */
  lines: string[];
  /** Said to a hero of this class. */
  byClass: Record<Archetype, string>;
}

export const NPCS: Record<NpcId, NpcInfo> = {
  carl: {
    id: 'carl',
    name: 'Carl',
    role: 'Oste e garante della tregua',
    prompt: 'Parla con Carl',
    color: '#f59e0b',
    lines: [
      'La tregua vale per tutti, persino per voi. Il conto no.',
      'Laggiù non si sale di livello: si impara a non morire. Poi si torna qui e si beve.',
      'Se tornate col bottino, è vostro. Se non tornate, il mare si tiene la sua parte.',
    ],
    byClass: {
      striker: 'Tu colpisci forte, lo vedo dalle nocche. Ricordati solo che i Corsari tengono lo scudo davanti: girali.',
      guardian: 'Uno come te lo metterei sulla porta. Laggiù fai da porta per gli altri, e tieni il fiato per parare.',
      skirmisher: 'Passo leggero, eh? I Granchi di Pietra stanno nei canali bassi. Non ci ballare sopra.',
      support: 'Senza di te gli altri durano la metà. Stai lontano dalle nubi di spore e canta dal piano alto.',
      arcane: 'La tua roba passa gli scudi dei Corsari come burro. Ma se ti prendono, non hai la pelle per reggere.',
      marksman: "Chi tira dall'alto fa più male, è vero. Finché il Nostromo non ti aggancia e ti tira giù.",
    },
  },
  iej: {
    id: 'iej',
    name: 'Iej',
    role: "Custode dell'Albero delle Abilità",
    prompt: "Albero delle Abilità (Gemme dell'Eclissi)",
    color: '#a855f7',
    lines: [
      "Le Gemme non ti rendono più forte. Rendono più tua la Speciale e l'Ultimate.",
      'Tre sentieri per abilità, e se ne percorre uno solo. Cambia idea quando vuoi: ti rendo tutto.',
    ],
    byClass: {
      striker: 'Potenza e Velocità ti somiglia. Ma prova il Dominio una volta: una pozza di fuoco fa il lavoro mentre tu sei altrove.',
      guardian: 'Per te vedo il Supporto Tattico: scudi che rimandano indietro i colpi a chi sta accanto a te.',
      skirmisher: 'Lacerare e sparire. Il Supporto Tattico lascia ferite aperte su chi tocchi.',
      support: 'Il tuo canto può zittire. Chiedimi del Supporto Tattico, quando avrai le Gemme.',
      arcane: "Dominio dello Spazio. Allarga il raggio finché la stanza intera non è tua.",
      marksman: 'Ricarica più corta, colpo più pesante. Potenza e Velocità, senza pensarci troppo.',
    },
  },
  saraya: {
    id: 'saraya',
    name: 'Saraya di Ujian',
    role: 'Sarta dei Fili d’Ombra',
    prompt: "Sartoria (Fili d'Ombra)",
    color: '#ec4899',
    lines: [
      "Un Filo d'Ombra non ferma una lama. Ma fa sì che si ricordino di chi l'ha fermata.",
      'Palette, vesti, colori per le tue arti, una posa per farti scegliere. Niente che ti faccia vincere.',
    ],
    byClass: {
      striker: 'Rosso cremisi. Così il sangue non si nota, e nemmeno la fretta.',
      guardian: 'A te cucirei qualcosa di sobrio. Chi regge il fronte non ha bisogno di lustrini... forse uno.',
      skirmisher: "Cenere d'Eclissi. Per chi preferisce non essere visto finché non è tardi.",
      support: 'Oro di Mur. Chi tiene in piedi gli altri merita di farsi notare.',
      arcane: 'Posso tingere anche la tua magia, sai? Viola etere, o un verde fatuo che inquieta.',
      marksman: "Blu abisso. Dall'alto di una torre ti confonderanno col cielo.",
    },
  },
  eleonora: {
    id: 'eleonora',
    name: 'Eleonora la Magnifica',
    role: 'Broker e patrona delle Taglie',
    prompt: 'Taglie di Eleonora',
    color: '#14b8a6',
    lines: [
      'Io non pago chi sopravvive. Pago chi sopravvive con stile.',
      'Un contratto alla volta, firmato da chi guida la Compagnia. Si incassa solo tornando vivi.',
    ],
    byClass: {
      striker: "Tu vorrai la taglia senza Ultimate. Ti conosco: non resisterai.",
      guardian: 'Nessuno a terra, per tutta una Città. Se c’è qualcuno che può garantirmelo, sei tu.',
      skirmisher: 'Contro il tempo. Otto minuti sono lunghi per chi corre come te.',
      support: 'Meno di mille danni in due Ambienti. Con te al seguito, potrei perfino scommetterci.',
      arcane: 'Rinunciare alla tua arte più grande per una borsa di Fili. Ti tenta, vero?',
      marksman: 'I miei clienti apprezzano i lavori puliti. Da lontano, possibilmente.',
    },
  },
  tavolo: {
    id: 'tavolo',
    name: 'Tavolo della Mappa',
    role: 'Le rotte della Costa Est',
    prompt: 'Tavolo della Mappa',
    color: '#0ea5e9',
    lines: ['Tre città, tre Ambienti ciascuna, e un Boss in fondo. Il Leviatano aspetta chi li abbatte tutti.'],
    byClass: {
      striker: 'Scegli la rotta. Il resto lo sai fare.',
      guardian: 'Scegli la rotta, e tienili insieme. Ma non troppo: ai Boss non piacciono i gruppi stretti.',
      skirmisher: 'Scegli la rotta. Al bivio, la via stretta paga di più.',
      support: 'Scegli la rotta. Il Santuario è sempre in fondo a una conca: non scenderci da solo.',
      arcane: 'Scegli la rotta. I piani alti sono tuoi.',
      marksman: 'Scegli la rotta. Cerca sempre il +2.',
    },
  },
};

export function isNpcId(v: unknown): v is NpcId {
  return typeof v === 'string' && v in NPCS;
}

/** What an NPC says to this hero: the class line first, then the common ones in turn. */
export function npcLine(npc: NpcId, hero: HeroId | '', turn: number): string {
  const def = NPCS[npc];
  const all = hero ? [def.byClass[HEROES[hero].archetype], ...def.lines] : def.lines;
  return all[((turn % all.length) + all.length) % all.length]!;
}

export const HUB_LINES: string[] = [
  'Benvenuti alla Taverna di Carl. La tregua vale per tutti, persino per voi.',
  'Il Tavolo della Mappa è al centro. Chi guida la Compagnia sceglie la rotta.',
  'I fantocci accanto all’ingresso non si offendono. Usateli per imparare a parare prima di imparare a sanguinare.',
];

/** Short lessons shown on loading screens and in the hub. */
export const FIELD_NOTES: string[] = [
  "Chi colpisce dall'alto fa il 10% di danni in più. Chi è due piani sotto non arriva nemmeno a toccarti in mischia.",
  'Il Santuario di Cura sta sempre in fondo a una conca: mentre vi curate, i nemici hanno il piano alto.',
  'Per aprire un Forziere di Sinergia qualcuno deve restare fermo e indifeso per quattro secondi. Copritelo.',
  'Davanti a un Boss non state tutti vicini: più siete nel raggio, più la sua onda fa male.',
  'Ogni Ambiente azzera Slancio, aure e Sinergie. Le ferite, invece, restano.',
  'Il bottino è personale: nessuno può raccogliere il vostro.',
  'Se cadete tutti, il mare brucia il 30% di ciò che avete trovato in quell’Ambiente.',
];

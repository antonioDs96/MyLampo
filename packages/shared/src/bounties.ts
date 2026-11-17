/**
 * Eleonora's contracts. One contract at a time, signed in the hub by the Host for the whole
 * company; it is judged on what happens during a single expedition and paid in Fili d'Ombra
 * at extraction.
 */
import { CITY_BOSS_STAGE } from './campaign';

export interface BountyDef {
  id: string;
  name: string;
  text: string;
  /** Fili d'Ombra paid to every member of the company at extraction. */
  reward: number;
}

export const BOUNTY_DAMAGE_CAP = 1000;
export const BOUNTY_TIME_LIMIT = 8 * 60;

export const BOUNTIES: BountyDef[] = [
  {
    id: 'incolumi',
    name: 'Incolumi',
    text: `Completate gli Ambienti 2 e 3 di fila subendo meno di ${BOUNTY_DAMAGE_CAP} danni in totale.`,
    reward: 150,
  },
  {
    id: 'senza_ultimate',
    name: 'A Mani Nude',
    text: "Uccidete il Boss di Città senza che nessuno usi un'Ultimate.",
    reward: 200,
  },
  {
    id: 'contro_il_tempo',
    name: 'Contro il Tempo',
    text: 'Abbattete un Mini-Boss entro 8 minuti dal vostro ingresso nel suo Ambiente.',
    reward: 120,
  },
  {
    id: 'nessun_caduto',
    name: 'Nessuno a Terra',
    text: 'Completate una Città intera in una sola spedizione, Boss compreso, senza eroi a terra e senza rianimazioni manuali.',
    reward: 300,
  },
];

export const BOUNTY_BY_ID: Record<string, BountyDef> = Object.fromEntries(BOUNTIES.map((b) => [b.id, b]));

/** What the company did in one stage of an expedition. */
export interface StageLog {
  /** 0..2 for the Environments, 3 for the City Boss. */
  index: number;
  cleared: boolean;
  /** Damage taken by the whole company. */
  taken: number;
  ults: number;
  downs: number;
  revives: number;
  /** Seconds from entering the stage to the death of its boss. */
  bossTime: number;
}

export type BountyVerdict = 'open' | 'done' | 'failed';

/** Judges a contract against the stages played so far in this expedition, in order. */
export function judgeBounty(id: string, log: readonly StageLog[]): BountyVerdict {
  const at = (index: number): StageLog | undefined => log.find((s) => s.index === index);
  switch (id) {
    case 'incolumi': {
      const second = at(1);
      const third = at(2);
      const taken = (second?.taken ?? 0) + (third?.taken ?? 0);
      if (taken >= BOUNTY_DAMAGE_CAP) return 'failed';
      return second?.cleared && third?.cleared ? 'done' : 'open';
    }
    case 'senza_ultimate': {
      const boss = at(CITY_BOSS_STAGE);
      if (!boss) return 'open';
      if (boss.ults > 0) return 'failed';
      return boss.cleared ? 'done' : 'open';
    }
    case 'contro_il_tempo': {
      for (const s of log) {
        if (s.index < CITY_BOSS_STAGE && s.cleared && s.bossTime <= BOUNTY_TIME_LIMIT) return 'done';
      }
      return 'open';
    }
    case 'nessun_caduto': {
      for (const s of log) if (s.downs > 0 || s.revives > 0) return 'failed';
      // The whole City in one expedition: it must start from the first Environment.
      if (log.length > 0 && log[0]!.index !== 0) return 'failed';
      for (let i = 0; i <= CITY_BOSS_STAGE; i++) if (!at(i)?.cleared) return 'open';
      return 'done';
    }
    default:
      return 'failed';
  }
}

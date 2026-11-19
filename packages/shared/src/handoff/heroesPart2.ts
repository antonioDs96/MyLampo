import type { HeroSpec, StatusPayload } from './types';

const sp = (
  type: StatusPayload['type'],
  intensity: number,
  unit: string,
  durationSec: number,
  target: StatusPayload['target'] = 'enemy',
): StatusPayload => ({ type, intensity, unit, durationSec, target });

export const HEROES_PART_2: HeroSpec[] = [
  // -------------------------------------------------------------------------
  // 6. FABYORN
  // -------------------------------------------------------------------------
  {
    id: 'fabyorn',
    code: 'FA',
    name: 'Fabyorn, il Berserker di Jugianel',
    short: 'Fabyorn',
    title: 'Frontline Pesante · Breaker & Cleave',
    role: 'Guerriero Berserker • Sfondamento & Stagger Power',
    archetype: 'breaker',
    home: 'Jugianel',
    color: '#ea580c',
    hp: 165,
    stamina: 105,
    speed: 6.8,
    critBase: 14,
    weaponStyle: 'Mannaia a due mani (archi 180°–360°, 2.8–3.0m) · Max Stagger Power del roster',
    passiveExpansion: {
      innatePassive: 'Furia Crescente: danno e velocità d’attacco scalano linearmente sotto il 50% HP. Zero cure, zero balzi.',
      passiveBranchName: 'Passiva · Tempra di Jugianel',
      passiveTiers: [
        { tier: 1, name: 'Spinta di Ferro I', effect: '+12% danno alla Barra Postura su tutti gli attacchi pesanti.', gemCost: 45 },
        { tier: 2, name: 'Soglia del Dolore II', effect: 'Sotto il 50% HP ottiene +6% riduzione danni subiti.', gemCost: 90 },
        { tier: 3, name: 'Slancio Inarrestabile III', effect: 'Spezzare uno scudo o uccidere un nemico ripristina +10 Stamina.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Peso dell’Incudine Spezzata',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Fabyorn',
        gemCost: 220,
        effect: 'Durante i 4.0s di Break del Boss (o 6.0s su Convergenza dell’Eclisse), gli attacchi pesanti e Sfondamento di Mannaia [E] di Fabyorn agiscono da Executor potenziato (+12% danno reale senza riduzione d’armatura).',
        synergyTag: 'Ruolo Executor puro durante le finestre di Break',
      },
    },
    specialE: {
      slot: 'E',
      name: 'Sfondamento di Mannaia',
      resource: 'Stamina',
      resourceCost: 24,
      cooldownSec: 7.0,
      baseSummary: 'Arco 180° (2.8m): 24 danni fisici, Stagger garantito mob minori e spinta 1.5m.',
      tier1: { title: 'T1 · Sfondamento Base', effect: '24 danni, arco 180°, 2.8m, spinta 1.5m.', vfx: 'Arco fendente rosso ferro opaco.' },
      tier2: { title: 'T2 · Slancio del Berserker', effect: 'Costo ridotto a 20 Stamina; +2 danno piatto (26).', vfx: 'Scia metallica con scintille ruggine.' },
      branches: [
        {
          branch: 'A',
          name: 'Colpo del Boia (Anti-Boss & Furia)',
          focus: 'Concentra l’arco a 90° per 32 danni e -20 postura Boss',
          tier3: { title: '3A · Taglio del Boia', effect: 'Arco 90°: 32 danni + -20 punti postura Boss.', vfx: 'Fendente dritto verticale rosso cremisi.', statuses: [] },
          tier4: { title: '4A · Empower Furia <50% HP', effect: 'Sotto 50% HP: +10% EMPOWER passivo.', vfx: 'Lama fuma di vapore rosso.', statuses: [sp('EMPOWER', 10, '%', 3, 'self')] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: "Fendente d'Africo", effect: 'DOT calore 3 dmg/s (3s).', vfx: 'Scia arancio-fuoco #D94E1F + calce.', statuses: [sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Armor Crack Boss', effect: 'Riduce armatura del Boss del 6% (3s).', vfx: 'Fiammata arancione sul bersaglio.', statuses: [sp('VULNERABLE', 6, '% armor', 3)] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: "Decapitazione d'Africo", effect: 'Sotto 25% HP: +12 danni netti; kill ripristina 20 Stamina.', vfx: 'Hit-Stop 3 frame, spacco calce bruciata.', statuses: [sp('REGEN', 20, 'stam', 1, 'self')] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Mannaia di Gelo Carsico', effect: 'SLOW -12% (2.5s) e -6% atk speed.', vfx: 'Lama coperta di brina #A8DADC.', statuses: [sp('SLOW', 12, '%', 2.5)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Postura Stun Boss', effect: 'Se Boss stordito: +15 punti danno postura extra.', vfx: 'Schegge ghiaccio secche a terra.', statuses: [] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Spacco del Grecale', effect: 'Applica VULNERABLE +10% al Boss (3.0s).', vfx: 'Hit-Stop 3 frame, blocco calcare ghiacciato.', statuses: [sp('VULNERABLE', 10, '%', 3)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Sferzata della Falesia', effect: 'Spinge indietro il bersaglio di 2.0m.', vfx: 'Onda d’aria compressa perlacea.', statuses: [sp('DISPLACE', 2, 'm', 0.3)] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Haste Fabyorn', effect: 'HASTE +6% move speed (2s) dopo impatto.', vfx: 'Polvere rotante sui calzari.', statuses: [sp('HASTE', 6, '%', 2, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Ciclone del Berserker', effect: 'Atterra il bersaglio principale sul posto per 1.0s.', vfx: 'Hit-Stop 3 frame, anello elicoidale.', statuses: [sp('STUN', 1.0, 's', 1.0)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Spazzata a Giro 360° (Sciami)',
          focus: 'Rotazione 3.0m anti-accerchiamento e rottura scudi',
          tier3: { title: '3B · Rotazione 360°', effect: 'Raggio 3.0m: 20 danni a tutti i mob + push 1.5m.', vfx: 'Decal circolare rossa con anello fendente.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
          tier4: { title: '4B · Blocco Dash Cerchio', effect: 'Stagger pesante 0.6s e blocco dash per 1.5s.', vfx: 'Fratture concentriche a terra.', statuses: [sp('STUN', 0.6, 's', 0.6), sp('ROOT', 1.5, 's dash', 1.5)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Faglia Circolare', effect: 'DOT 2 dmg/s (3s) attorno a Fabyorn.', vfx: 'Decal aranciata calda con fumo denso.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'Stamina on Multi-Hit', effect: '+1 Stamina per mob colpito (max +10 Stamina).', vfx: 'Scintille arancioni sui muscoli.', statuses: [sp('REGEN', 10, 'stam', 1, 'self')] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Turbine di Jugianel', effect: 'Distrugge tutti gli scudi lignei/leggeri dei mob colpiti.', vfx: 'Hit-Stop 3 frame, crepa magmatica circolare.', statuses: [sp('VULNERABLE', 8, '%', 3)] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Lastra 360°', effect: 'SLOW -15% (2.5s) a tutti i mob minori.', vfx: 'Lastra circolare di brina azzurro-bianca.', statuses: [sp('SLOW', 15, '%', 2.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Durata Lastra 3.5s', effect: 'Estende durata della lastra a 3.5s.', vfx: 'Cristalli di sale ai bordi decal.', statuses: [sp('SLOW', 15, '%', 3.5)] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: 'Cerchio di Ghiaccio Carsico', effect: 'Mob minori colpiti subiscono ROOT 1.2s.', vfx: 'Hit-Stop 3 frame, mandala brina piatto.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: 'Vortice Spazzata', effect: 'Allontana i mob minori di 2.0m liberando spazio.', vfx: 'Onde UV d’aria rotanti.', statuses: [sp('DISPLACE', 2, 'm', 0.3)] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Dash Cost Red', effect: '-25% costo stamina del successivo dash.', vfx: 'Turbine d’aria attorno alle gambe.', statuses: [sp('HASTE', 25, '% dash', 2, 'self')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: 'Ruggito della Scogliera', effect: 'Interrompe i canali di tutti i mob entro 3m.', vfx: 'Hit-Stop 3 frame, onda d’urto d’aria.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Guardia d’Attrito (Super-Armor)',
          focus: 'Tenacia totale contro i telegraph e scudo personale 10–12 HP',
          tier3: { title: '3C · Inamovibilità', effect: 'SUPER_ARMOR (2.0s) + SHIELD 10 HP (3.5s).', vfx: 'Bordo rosso ferro solido sul modello.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 2, 'self'), sp('SHIELD', 10, 'HP', 3.5, 'self')] },
          tier4: { title: '4C · Resistenza Passiva', effect: '-10% danni subiti con scudo attivo.', vfx: 'Lampo cupo all’impatto sull’armatura.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Ritorsione Termica', effect: 'Attaccanti in mischia subiscono 3 danni.', vfx: 'Scintille arancioni sull’armatura.', statuses: [] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Empower on Broken', effect: 'Scudo distrutto da colpo pesante: +8% EMPOWER (3s).', vfx: 'Bagliore arancione sulla mannaia.', statuses: [sp('EMPOWER', 8, '%', 3, 'self')] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: 'Favonio del Berserker', effect: 'Con scudo attivo, perdita di HP non riduce la stamina.', vfx: 'Hit-Stop 3 frame, sigillo calce bruciata.', statuses: [] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: 'Soffio di Gelo', effect: 'Alla scadenza scudo: -8% atk speed mob adiacenti (2s).', vfx: 'Sbuffo vapore azzurro a terra.', statuses: [sp('SLOW', 8, '% atk', 2)] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Scudo Potenziato', effect: 'Scudo sale a 12 HP.', vfx: 'Bordo ghiacciato compatto.', statuses: [sp('SHIELD', 12, 'HP', 3.5, 'self')] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: 'Corazza del Dente Invernale', effect: 'Scudo riduce del 15% i danni da colpi telegrafati pesanti.', vfx: 'Hit-Stop 3 frame, guscio di brina.', statuses: [] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Aura Cinetica', effect: 'Con scudo attivo: HASTE +8% move speed.', vfx: 'Scie d’aria bianca sui piedi.', statuses: [sp('HASTE', 8, '%', 3.5, 'self')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Dash Cost Red', effect: '-20% costo dash durante lo scudo.', vfx: 'Turbinio attorno alle gambe.', statuses: [sp('HASTE', 20, '% dash', 3.5, 'self')] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Incrollabile', effect: 'Immunità totale a qualsiasi DISPLACE per 3.0s netti.', vfx: 'Hit-Stop 3 frame, rosa dei venti d’aria.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 3, 'self')] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: 'Rovina di Jugianel',
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 60.0,
      baseSummary: 'Pianta la mannaia: cono cinetico frontale (90°, 6m) da 24 danni, Stagger pesante e -25 postura Boss.',
      tier1: { title: 'T1 · Rovina Base', effect: 'Cono 90° (6m), 24 danni, -25 postura Boss.', vfx: 'Eruzione cinetica frontale.' },
      tier2: { title: 'T2 · Peso della Mannaia', effect: '-10% startup; +2 danno piatto (26).', vfx: 'Detriti pesanti a terra.' },
      branches: [
        {
          branch: 'A',
          name: 'Sfondamento Totale (Spaccacorazza)',
          focus: 'Faglia rettilinea 8m da 32 danni e -30 postura frontale',
          tier3: { title: '3A · Faglia Rettilinea 8m', effect: '32 danni e -8% armatura (4.0s).', vfx: 'Solco profondo nella roccia.', statuses: [sp('VULNERABLE', 8, '% armor', 4)] },
          tier4: { title: '4A · Guardia Boss Spezzata', effect: 'Colpo frontale sul Boss rimuove 30 punti postura.', vfx: 'Bagliore rosso ferro ad alta intensità.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: "Faglia dell'Alba d'Oriente", effect: 'Colonna dorata 6m: VULNERABLE +10% (4.0s).', vfx: 'Decal dorata #FFD166 + raggio unlit.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Danno Heavy in Luce', effect: '+8% EMPOWER sui colpi pesanti nella luce.', vfx: 'Fregio dorato sulla lama.', statuses: [sp('EMPOWER', 8, '% heavy', 4, 'self')] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: 'Alba della Mannaia', effect: 'Boss in Break: +12 danni netti e +1.5s Break.', vfx: 'Hit-Stop 3 frame, colonna d’oro solida.', statuses: [] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: 'Marea del Crepuscolo di Guerra', effect: 'Pull 2m + DOT 3 dmg/s (4s).', vfx: 'Decal indaco/cremisi #9A031E.', statuses: [sp('DISPLACE', 2, 'm pull', 0.4), sp('DOT', 3, 'dmg/s', 4)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stamina in Pozza', effect: '+12 stamina/s nella risacca.', vfx: 'Onde scure animate a terra.', statuses: [sp('REGEN', 12, 'stam/s', 4, 'self')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: 'Risacca di Sangue', effect: 'Implosione finale atterra mob minori 1.2s.', vfx: 'Hit-Stop 3 frame, specchio d’acqua scuro.', statuses: [sp('STUN', 1.2, 's', 1.2)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Onda d’Urto di Battaglia (360° Arena)',
          focus: 'Controllo radiale 5m con spinta 2.0m e buff team',
          tier3: { title: '3B · Eruzione 360°', effect: 'Raggio 5m: 20 danni e allontana tutti i mob di 2.0m.', vfx: 'Decal circolare rossa d’urto.', statuses: [sp('DISPLACE', 2, 'm', 0.4)] },
          tier4: { title: '4B · Slow d’Urto', effect: 'Stagger pesante 0.8s + SLOW -10% (3s).', vfx: 'Fratture concentriche a terra.', statuses: [sp('STUN', 0.8, 's', 0.8), sp('SLOW', 10, '%', 3)] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Bagliore del Berserker', effect: 'Tiratori nemici: -15% precisione (4s).', vfx: 'Onda dorata circolare piatta.', statuses: [sp('SLOW', 15, '% acc', 4)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Super-Armor Avvio', effect: 'SUPER_ARMOR per 2.5s.', vfx: 'Contorno dorato solido.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 2.5, 'self')] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: 'Bagliore del Berserker (Party)', effect: 'Compagni entro 6m: EMPOWER +6% (3.0s).', vfx: 'Hit-Stop 3 frame, stella solare d’oro.', statuses: [sp('EMPOWER', 6, '%', 3, 'party')] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: "Risacca dell'Onda", effect: 'SLOW -15% e blocco scatti per 3s.', vfx: 'Pozza scura bordata d’arancio.', statuses: [sp('SLOW', 15, '%', 3), sp('ROOT', 1.5, 's dash', 3)] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Stamina Avvio', effect: '+15 Stamina all’attivazione.', vfx: 'Scie d’acqua verso i piedi.', statuses: [sp('REGEN', 15, 'stam', 1, 'self')] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: 'Risacca Devastante', effect: 'Infligge +25 punti danno postura al Boss.', vfx: 'Hit-Stop 3 frame, distorsione crepuscolare.', statuses: [] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Furia Incontenibile (Undying)',
          focus: 'Anti-morte a 1 HP + scudo 12–14 HP e Super-Armor',
          tier3: { title: '3C · Sangue Indomito', effect: 'SHIELD 12 HP (5.0s) + non scende sotto 1 HP per 1.5s.', vfx: 'Guscio rosso ferro + Rim-Light cremisi.', statuses: [sp('SHIELD', 12, 'HP', 5, 'self')] },
          tier4: { title: '4C · Resistenza in Scudo', effect: '-10% danni da tutte le fonti con scudo attivo.', vfx: 'Armatura fuma di vapore denso.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: 'Furia Solare', effect: 'Scudo sale a 14 HP e purifica DoT e slow.', vfx: 'Decal dorata + raggio unlit.', statuses: [sp('SHIELD', 14, 'HP', 5, 'self')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Ritorsione Luce', effect: 'Scudo colpito in mischia infligge 6 danni radiosi.', vfx: 'Lampo dorato reattivo.', statuses: [] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: 'Eclisse del Berserker', effect: 'Immunità totale a barcollamento (SUPER_ARMOR 3.0s).', vfx: 'Hit-Stop 3 frame, pilastro d’oro solido.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 3, 'self')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: 'Marea Infernale', effect: 'Rigenera 2 HP/s (3s) e +15 stamina/s.', vfx: 'Decal indaco con riflessi arancio.', statuses: [sp('REGEN', 2, 'HP/s', 3, 'self')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Durata Scudo 6.0s', effect: 'Estende durata scudo a 6.0s.', vfx: 'Increspature calme a pavimento.', statuses: [] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: 'Risacca Infrangibile', effect: 'Se scudo azzerato: 1.0s i-frame + 20 Stamina.', vfx: 'Hit-Stop 3 frame, specchio d’acqua scuro.', statuses: [sp('REGEN', 20, 'stam', 1, 'self')] },
            ],
          },
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 7. GABRYEL
  // -------------------------------------------------------------------------
  {
    id: 'gabryel',
    code: 'GA',
    name: 'Gabryel, lo Studioso del Chiavistello',
    short: 'Gabryel',
    title: 'Supporto Radiante · Artiglieria & Cleanse',
    role: 'Stregone di Luce e Studioso • Purificazione & Barriere',
    archetype: 'artillery',
    home: 'Costa Est',
    color: '#eab308',
    hp: 95,
    stamina: 110,
    speed: 7.0,
    critBase: 15,
    weaponStyle: 'Bastone Chiavistello · Raggi zenitali, cleanse debuff & barriere luminose',
    passiveExpansion: {
      innatePassive: 'Fede Lucida: purificare un debuff da un alleato gli conferisce +10 Stamina e riduce di 0.5s il cooldown di [E].',
      passiveBranchName: 'Passiva · Dottrina del Chiavistello',
      passiveTiers: [
        { tier: 1, name: 'Lente Zenitale I', effect: '+1.5m lunghezza raggi e +15% rigenerazione Mana/Eclissi.', gemCost: 45 },
        { tier: 2, name: 'Voto del Medico II', effect: 'Gli scudi applicati da Gabryel aumentano di +2 HP.', gemCost: 90 },
        { tier: 3, name: 'Faro d’Alba III', effect: 'Quando è a Quota +1, i raggi di Luce infliggono +10% danno e riducono di 10% il cooldown.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Sigillo della Stella a Otto Punte',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Gabryel',
        gemCost: 220,
        effect: 'Catarsi del Sole Nero [R] genera sempre una zona di Levante secondaria centrata su Gabryel: se combinata con Ponente di un compagno innesca istantaneamente Convergenza dell’Eclisse (+2.0s Break).',
        synergyTag: 'Garanzia di Convergenza dell’Eclisse (Break 6.0s) in raid',
      },
    },
    specialE: {
      slot: 'E',
      name: 'Raggio del Chiavistello',
      resource: 'Mana',
      resourceCost: 20,
      cooldownSec: 7.5,
      baseSummary: 'Canalizza 0.5s e scocca un raggio rettilineo (10m × 1.5m): 20 danni radiosi e Stagger leggero.',
      tier1: { title: 'T1 · Raggio Base', effect: '20 danni radiosi, 10m × 1.5m, Stagger mob minori.', vfx: 'Fascio bianco-dorato rettilineo.' },
      tier2: { title: 'T2 · Concentrazione di Luce', effect: 'Canale ridotto a 0.35s; +2 danno piatto (22).', vfx: 'Flash concentrico sulla testa bastone.' },
      branches: [
        {
          branch: 'A',
          name: 'Raggio Penetrante (Weakpoint)',
          focus: 'Trapassa senza calo danno + -15 postura frontale',
          tier3: { title: '3A · Trapasso Totale', effect: '26 danni a tutti + VULNERABLE +6% al 1° bersaglio (3s).', vfx: 'Raggio dorato con scia prismatica.', statuses: [sp('VULNERABLE', 6, '%', 3)] },
          tier4: { title: '4A · Postura Boss -15', effect: 'Colpo frontale al Boss rimuove 15 punti postura.', vfx: 'Esplosione geometrica dorata.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: 'Raggio di Favonio', effect: 'DOT calore 3 dmg/s (3s) a tutti gli attraversati.', vfx: 'Scia arancio-fuoco #D94E1F + brace.', statuses: [sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Armor Crack Boss', effect: 'Riduce armatura del Boss del 6% (3s).', vfx: 'Bagliore arancione pulsante.', statuses: [sp('VULNERABLE', 6, '% armor', 3)] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: "Lancia d'Africo", effect: 'Sotto 25% HP: +10 danni netti; kill ripristina 15 Mana.', vfx: 'Hit-Stop 3 frame, fessura calce bruciata.', statuses: [] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Fascio di Brina Radiosa', effect: 'SLOW -12% (2.5s) e -6% atk speed.', vfx: 'Luce azzurro-cianotica #A8DADC.', statuses: [sp('SLOW', 12, '%', 2.5)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Freeze CD Boss', effect: 'Se Boss stordito, congela i cooldown per 1.0s.', vfx: 'Bordo brinato sul Boss.', statuses: [] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Raggio del Grecale', effect: 'Se già rallentato: ROOT 1.2s sul posto.', vfx: 'Hit-Stop 3 frame, prisma azzurro piatto.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Lancia di Burrasca', effect: 'Spinge indietro tutti i mob attraversati di 1.5m.', vfx: 'Fascio d’aria perlaceo a pavimento.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Haste Gabryel', effect: 'HASTE +8% move speed (2s) dopo il colpo.', vfx: 'Turbinio attorno alle vesti.', statuses: [sp('HASTE', 8, '%', 2, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Saetta della Falesia', effect: 'Trapassa qualsiasi ostacolo a Quota +1/+2 senza interruzione.', vfx: 'Hit-Stop 3 frame, fascio d’aria continuo.', statuses: [] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Pilastro Purificatore (Area 3.5m)',
          focus: 'Cleanse 1 debuff + controllo d’area solare',
          tier3: { title: '3B · Pilastro di Luce', effect: 'Area 3.5m (3s): 15 danni ai mob + purifica 1 debuff al party.', vfx: 'Decal dorata + raggio unlit verticale.', statuses: [] },
          tier4: { title: '4B · Slow Pilastro', effect: 'Nemici nel pilastro: SLOW -10% (2.5s).', vfx: 'Raggi dorati concentrici a terra.', statuses: [sp('SLOW', 10, '%', 2.5)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Calore Radiante', effect: 'DOT 2 dmg/s (3s) nel pilastro.', vfx: 'Decal aranciata calda con fumo.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'Empower Compagni', effect: 'Alleati nel pilastro: +6% EMPOWER (2s).', vfx: 'Bordo arancione sulle armi alleate.', statuses: [sp('EMPOWER', 6, '%', 2, 'party')] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Cattedrale di Calce Viva', effect: 'Mob nel pilastro hanno precisione ridotta del 15% (3.0s).', vfx: 'Hit-Stop 3 frame, mandala solare calce.', statuses: [sp('SLOW', 15, '% acc', 3)] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Lastra Solare', effect: 'Impedisce il dash ai mob per 1.5s.', vfx: 'Lastra di brina semitrasparente.', statuses: [sp('ROOT', 1.5, 's dash', 1.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Durata Pilastro 3.5s', effect: 'Estende durata pilastro a 3.5s.', vfx: 'Cristalli di sale ai bordi.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: "Silenzio del Ghiaccio d'Alba", effect: 'Mob minori nel pilastro subiscono ROOT 1.2s.', vfx: 'Hit-Stop 3 frame, lastra brina solida.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: 'Raffica Pilastro', effect: 'Allontana mob minori di 1.5m dal perimetro.', vfx: 'Anello d’aria perlaceo espanso.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Haste Compagni', effect: 'Alleati che attraversano: HASTE +6% (2s).', vfx: 'Micro-scie sui calzari alleati.', statuses: [sp('HASTE', 6, '%', 2, 'party')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: 'Rifugio della Burrasca', effect: 'Pilastro deflette tutti i proiettili leggeri nemici.', vfx: 'Hit-Stop 3 frame, cupola d’aria piatta.', statuses: [] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Egida Radiosa (Scudi & Cura)',
          focus: 'Scudo 8–10 HP sui compagni attraversati + rigenerazione',
          tier3: { title: '3C · Raggio d’Egida', effect: 'Compagni attraversati: SHIELD 8 HP (3.5s) + 10 Stamina.', vfx: 'Bordo bianco-oro sui compagni colpiti.', statuses: [sp('SHIELD', 8, 'HP', 3.5, 'party'), sp('REGEN', 10, 'stam', 1, 'party')] },
          tier4: { title: '4C · Stamina Cost Red', effect: '-10% costo stamina azioni durante lo scudo.', vfx: 'Rim-Light dorato sottile.', statuses: [sp('HASTE', 10, '% stam', 3.5, 'party')] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Ritorsione Termica', effect: 'Attaccanti in mischia subiscono 3 danni.', vfx: 'Scintille arancioni sull’armatura alleata.', statuses: [] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Empower on Decay', effect: 'Alla scadenza scudo: +6% EMPOWER (2s).', vfx: 'Lampo arancione sul compagno.', statuses: [sp('EMPOWER', 6, '%', 2, 'party')] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: 'Favonio del Santuario', effect: 'Compagni protetti rigenerano 2 HP/s per 3.0s (6 HP).', vfx: 'Hit-Stop 3 frame, sigillo calce bruciata.', statuses: [sp('REGEN', 2, 'HP/s', 3, 'party')] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: 'Tempera Radiosa', effect: 'Resistenza a rallentamenti 30% per 3.0s.', vfx: 'Bordo azzurro chiaro sui compagni.', statuses: [] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Scudo Potenziato', effect: 'Scudo sale a 10 HP.', vfx: 'Alone di brina compatto.', statuses: [sp('SHIELD', 10, 'HP', 3.5, 'party')] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: "Corazza del Sole d'Inverno", effect: 'Scudo conferisce SUPER_ARMOR per 1.5s.', vfx: 'Hit-Stop 3 frame, guscio di brina.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 1.5, 'party')] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Aura Leggera', effect: 'Scudo aumenta Move Speed compagno +8% (3.0s).', vfx: 'Micro-folate perlacee ai piedi.', statuses: [sp('HASTE', 8, '%', 3, 'party')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Dash Cost Red', effect: '-15% costo dash durante lo scudo.', vfx: 'Turbinio d’aria sui calzari.', statuses: [sp('HASTE', 15, '% dash', 3, 'party')] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Ali del Maestrale', effect: 'Su attacco pesante, spinge il compagno indietro 2m al sicuro con 0.5s i-frame.', vfx: 'Hit-Stop 3 frame, rosa dei venti protettiva.', statuses: [] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: 'Catarsi del Sole Nero',
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 60.0,
      baseSummary: 'Area circolare 7m (4.5s): 22 danni radiosi + SLOW -12% ai nemici; SHIELD 12 HP + cleanse totale al party.',
      tier1: { title: 'T1 · Catarsi Base', effect: 'Area 7m (4.5s), 22 danni, SLOW -12%, SHIELD 12 HP + cleanse.', vfx: 'Decal solare radiosa con bordo nero.' },
      tier2: { title: 'T2 · Fede dello Studioso', effect: '-10% startup; +2 danno radioso.', vfx: 'Raggiature geometriche nitide.' },
      branches: [
        {
          branch: 'A',
          name: 'Giudizio Zenitale (Anti-Boss)',
          focus: '-8% armatura, -25 postura Boss e Break esteso',
          tier3: { title: '3A · Rottura Armatura', effect: '-8% armatura (4.5s) e -25 postura al Boss.', vfx: 'Fessure di luce dorata a pavimento.', statuses: [sp('VULNERABLE', 8, '% armor', 4.5)] },
          tier4: { title: '4A · Stagger Continuo', effect: 'Mob minori nell’area subiscono Stagger ogni 1.5s.', vfx: 'Pulsazioni d’oro chiaro dal centro.', statuses: [sp('STUN', 0.4, 's/1.5s', 4.5)] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: 'Alba del Giudizio', effect: 'Colonna dorata 6m: VULNERABLE +10% (4.0s).', vfx: 'Decal dorata #FFD166 + raggio unlit.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Crit in Luce', effect: 'Party nella luce: +8% Crit Rate.', vfx: 'Lame dorate sulle armi party.', statuses: [sp('EMPOWER', 8, '% crit', 4, 'party')] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: "L'Alba Suprema d'Otranto", effect: 'Boss in Break: +12 danni e +1.5s Break.', vfx: 'Hit-Stop 3 frame, colonna d’oro solida.', statuses: [] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: 'Crepuscolo del Giudizio', effect: 'Pull 2m + DOT 3 dmg/s (4s).', vfx: 'Decal indaco/cremisi #9A031E.', statuses: [sp('DISPLACE', 2, 'm pull', 0.4), sp('DOT', 3, 'dmg/s', 4)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stealth Distanza', effect: 'Mob nella risacca perdono il puntamento.', vfx: 'Ombre allungate verso est.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 2, 'self')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: 'Voragine Crepuscolare', effect: 'Implosione finale atterra mob minori 1.2s.', vfx: 'Hit-Stop 3 frame, specchio d’acqua scuro.', statuses: [sp('STUN', 1.2, 's', 1.2)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Faro di Battaglia (Soppressione)',
          focus: 'Barriera anti-mira esterna + accecamento totale 2.5s',
          tier3: { title: '3B · Ghost Wall Circolare', effect: 'Impedisce ai nemici esterni di mirare al party interno.', vfx: 'Anello di luce dorata spesso a terra.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 4.5, 'party')] },
          tier4: { title: '4B · Precisione Tiratori Red', effect: '-15% precisione tiratori nemici.', vfx: 'Pulviscolo dorato radente a terra.', statuses: [sp('SLOW', 15, '% acc', 4.5)] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Bagliore Faro', effect: 'Acceca nemici interni per 2.5s (no attacchi).', vfx: 'Lampo dorato orizzontale.', statuses: [sp('STUN', 2.5, 's blind', 2.5)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Haste Party', effect: 'Compagni nell’area: HASTE +8% (3s).', vfx: 'Bordo dorato compatto alleati.', statuses: [sp('HASTE', 8, '%', 3, 'party')] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: "Stella Polare d'Alba", effect: 'Distrugge istantaneamente tutti i proiettili nell’area.', vfx: 'Hit-Stop 3 frame, stella solare dorata.', statuses: [] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: 'Risacca del Faro', effect: 'SLOW -18% e blocco scatti.', vfx: 'Pozza scura bordata d’arancio.', statuses: [sp('SLOW', 18, '%', 4.5), sp('ROOT', 1.5, 's dash', 4.5)] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Estensione Debuff', effect: 'Precisione ridotta estesa a 5.0s.', vfx: 'Bordi sfumati indaco scuro.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: 'Silenzio dello Jonio', effect: 'Nemici speciali subiscono Silenzio abilità 2.0s.', vfx: 'Hit-Stop 3 frame, pozza marea scura.', statuses: [sp('ROOT', 2, 's skill', 2)] },
            ],
          },
        },
        {
          branch: 'C',
          name: "Santuario dell'Eclisse (Grazia)",
          focus: 'Scudo 14–15 HP, Regen 3 HP/s e rianimazione istantanea',
          tier3: { title: '3C · Terra Consacrata', effect: 'SHIELD 14 HP (5.0s) + REGEN +15 stamina/s al party.', vfx: 'Decal dorata radiosa barocca.', statuses: [sp('SHIELD', 14, 'HP', 5, 'party'), sp('REGEN', 15, 'stam/s', 5, 'party')] },
          tier4: { title: '4C · Difesa Totale Party', effect: '-10% danni da tutte le fonti nell’area.', vfx: 'Bordo oro-bianco continuo sui compagni.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: "Grazia d'Oriente", effect: 'Scudo 15 HP + immunità slow per 3s.', vfx: 'Decal dorata + raggio unlit.', statuses: [sp('SHIELD', 15, 'HP', 5, 'party')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Stun Reattivo', effect: 'Scudo distrutto stordisce l’attaccante per 0.5s.', vfx: 'Scintilla dorata reattiva.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: "Redenzione d'Alba", effect: 'Party ottiene SUPER_ARMOR per 2.0s netti.', vfx: 'Hit-Stop 3 frame, pilastro d’oro solido.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 2, 'party')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: 'Marea Risanatrice', effect: 'Party rigenera 3 HP/s per 3.0s (9 HP).', vfx: 'Pozza calma indaco con bordo arancio.', statuses: [sp('REGEN', 3, 'HP/s', 3, 'party')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Stamina Regen +20', effect: 'Rigenerazione stamina sale a +20/sec.', vfx: 'Increspature calme a pavimento.', statuses: [sp('REGEN', 20, 'stam/s', 5, 'party')] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: 'Risacca della Rinascita', effect: 'Compagni caduti a 0 HP nell’area rianimati all’istante (1/sessione).', vfx: 'Hit-Stop 3 frame, specchio d’acqua placido.', statuses: [] },
            ],
          },
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 8. ANTHON
  // -------------------------------------------------------------------------
  {
    id: 'anthon',
    code: 'AN',
    name: 'Anthon, la Mina Vagante del Caos',
    short: 'Anthon',
    title: 'Disruptor Spaziale · Teletrasporto & Pull',
    role: 'Stregone del Caos • Anomalie & Spiazzamento',
    archetype: 'disruptor',
    home: 'Costa Est',
    color: '#c084fc',
    hp: 90,
    stamina: 115,
    speed: 7.4,
    critBase: 16,
    weaponStyle: 'Blink nativo (7.5m) + fessure dimensionali di attrazione e scambio tattico',
    passiveExpansion: {
      innatePassive: 'Instabilità di Soglia: ogni Blink di schivata lascia un micro-impulso che riduce di 0.4s il cooldown di Anomalia Caotica [E].',
      passiveBranchName: 'Passiva · Frattura del Viandante',
      passiveTiers: [
        { tier: 1, name: 'Eco Dimensionale I', effect: '+1.5m gittata su Anomalia Caotica [E] e Collasso [R].', gemCost: 45 },
        { tier: 2, name: 'Spazio Piegato II', effect: 'Costo del Blink ridotto del 15% quando è vicino a un’anomalia.', gemCost: 90 },
        { tier: 3, name: 'Contraccolpo Entropico III', effect: 'Attrarre >= 3 nemici in una singolarità restituisce +12 Mana.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Paradosso delle Due Sponde',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Anthon',
        gemCost: 220,
        effect: 'Il teletrasporto di Scambio Dimensionale (3C) o Porta di Salvezza (4C) può attraversare Blood Gate o fessure verticali interne solo dentro la zona attiva di combattimento, rilasciando un tag Maestrale automatico.',
        synergyTag: 'Controllo posizionamento di squadra su mappe con baratri -2',
      },
    },
    specialE: {
      slot: 'E',
      name: 'Anomalia Caotica',
      resource: 'Mana',
      resourceCost: 22,
      cooldownSec: 8.0,
      baseSummary: 'Fessura instabile 3m (gittata 8m): dopo 0.4s implode per 18 danni caos + pull 1.5m.',
      tier1: { title: 'T1 · Anomalia Base', effect: '18 danni, raggio 3m, pull 1.5m dopo 0.4s.', vfx: 'Decal viola/magenta con bordi fratturati.' },
      tier2: { title: 'T2 · Impulso Caotico', effect: 'Innesco ridotto a 0.25s; +2 danno piatto (20).', vfx: 'Scintille viola scuro al centro.' },
      branches: [
        {
          branch: 'A',
          name: 'Fenditura Instabile (Burst)',
          focus: '28 danni al centro + Stagger pesante + -15 postura Boss',
          tier3: { title: '3A · Implosione Centrale', effect: '28 danni al target centrale + Stagger 0.6s.', vfx: 'Frattura magenta profonda.', statuses: [sp('STUN', 0.6, 's', 0.6)] },
          tier4: { title: '4A · Postura Boss -15', effect: 'Rimuove 15 punti postura al Boss all’epicentro.', vfx: 'Flash viola acuto all’impatto.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: "Anomalia d'Africo", effect: 'DOT calore 3 dmg/s (3s).', vfx: 'Scia arancio-fuoco #D94E1F + fumo.', statuses: [sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Armor Crack Boss', effect: '-6% armatura Boss (3s).', vfx: 'Bagliore arancione pulsante.', statuses: [sp('VULNERABLE', 6, '% armor', 3)] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: "Singolarità d'Africo", effect: 'Sotto 25% HP: +10 danni + onda secondaria 8 danni.', vfx: 'Hit-Stop 3 frame, cratere calce bruciata.', statuses: [] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Fessura Glaciale', effect: 'SLOW -12% (2.5s) e -6% atk speed.', vfx: 'Schegge ghiaccio viola-azzurro.', statuses: [sp('SLOW', 12, '%', 2.5)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Freeze CD Boss', effect: 'Se stordito, congela cooldown Boss per 1.0s.', vfx: 'Bordo brinato sul Boss.', statuses: [] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Frattura del Grecale', effect: 'Se già rallentato: ROOT 1.2s sul posto.', vfx: 'Hit-Stop 3 frame, prisma azzurro piatto.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Vortice di Burrasca', effect: 'Dopo il pull, spinge via i mob circostanti di 1.5m.', vfx: 'Linee d’aria perlacee.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Haste Anthon', effect: 'HASTE +8% move speed (2s) dopo implosione.', vfx: 'Micro-scie attorno alle vesti.', statuses: [sp('HASTE', 8, '%', 2, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Ciclone del Vuoto', effect: 'Atterra sul posto tutti i mob minori per 1.0s.', vfx: 'Hit-Stop 3 frame, anello elicoidale.', statuses: [sp('STUN', 1.0, 's', 1.0)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Fessura di Dispersione (Campo)',
          focus: 'Campo persistente 3.5s che blocca dash e devia proiettili',
          tier3: { title: '3B · Campo di Distorsione', effect: 'Persiste 3.5s: SLOW -10% e disorienta i mob.', vfx: 'Decal magenta pulsante a terra.', statuses: [sp('SLOW', 10, '%', 3.5)] },
          tier4: { title: '4B · Blocco Dash Fessura', effect: 'Blocca lo scatto nemico nel campo.', vfx: 'Linee geometriche fratturate.', statuses: [sp('ROOT', 1.5, 's dash', 3.5)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Calce Caotica', effect: 'DOT 2 dmg/s (3s) nel campo.', vfx: 'Decal aranciata calda con fumo.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'Precisione Nemica Red', effect: '-10% precisione ai nemici nell’area.', vfx: 'Nube polvere opaca < 0.8m.', statuses: [sp('SLOW', 10, '% acc', 3.5)] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Calderone Instabile', effect: 'A fine campo esplode: 12 danni + Stagger.', vfx: 'Hit-Stop 3 frame, sfogo arancione piatto.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Lastra Caotica', effect: 'SLOW -15% e +10% danno postura sui mob.', vfx: 'Lastra brina semitrasparente.', statuses: [sp('SLOW', 15, '%', 3.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Durata Fessura 4.0s', effect: 'Estende durata a 4.0s.', vfx: 'Cristalli di sale ai bordi.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: 'Congelamento Dimensionale', effect: 'Mob fermi >2s: ROOT 1.2s.', vfx: 'Hit-Stop 3 frame, mandala brina.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: 'Muro di Vento', effect: 'Devia proiettili leggeri nemici.', vfx: 'Linee d’aria scorrevoli a pavimento.', statuses: [] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Haste su Campo', effect: 'Alleati sul campo: HASTE +6% move speed.', vfx: 'Micro-scie sui calzari alleati.', statuses: [sp('HASTE', 6, '%', 2, 'party')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: 'Occhio della Burrasca Caotica', effect: 'Deflette il primo telegraph a proiettile di un Mini-Boss.', vfx: 'Hit-Stop 3 frame, cerchio d’aria compresso.', statuses: [] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Scambio Dimensionale (Teletrasporto)',
          focus: 'Riattivazione entro 3s per teletrasporto, Stealth e scavalcamento',
          tier3: { title: '3C · Re-Cast Teletrasporto', effect: 'Riattiva entro 3s per TP all’epicentro + SHIELD 8 HP (3s).', vfx: 'Flash magenta partenza e arrivo.', statuses: [sp('SHIELD', 8, 'HP', 3, 'self')] },
          tier4: { title: '4C · Stealth on Teleport', effect: 'STEALTH_CAMO per 1.5s all’arrivo.', vfx: 'Cortina d’ombra viola a terra.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 1.5, 'self')] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Fiammata Partenza', effect: 'Punto di partenza esplode per 6 danni ai mob adiacenti.', vfx: 'Esplosione arancione circolare.', statuses: [] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Empower on TP', effect: '+6% EMPOWER al prossimo attacco.', vfx: 'Bagliore arancione sulle mani.', statuses: [sp('EMPOWER', 6, '%', 3, 'self')] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: 'Favonio del Caos', effect: 'TP ripristina +15 Stamina ai compagni vicini all’arrivo.', vfx: 'Hit-Stop 3 frame, fiamma calce incisa.', statuses: [sp('REGEN', 15, 'stam', 1, 'party')] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: 'Gelo Arrivo', effect: 'Punto d’arrivo: SLOW -12% (2s) entro 2m.', vfx: 'Lastra brina azzurra a terra.', statuses: [sp('SLOW', 12, '%', 2)] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Scudo Potenziato', effect: 'Scudo sale a 10 HP.', vfx: 'Guscio di brina compatto.', statuses: [sp('SHIELD', 10, 'HP', 3, 'self')] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: 'Varco Glaciale', effect: 'TP scambia posizione con un mob minore congelandolo 1.5s.', vfx: 'Hit-Stop 3 frame, prisma azzurro piatto.', statuses: [sp('ROOT', 1.5, 's', 1.5)] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Haste Party on TP', effect: 'Compagni entro 4m dall’arrivo: HASTE +8% (2s).', vfx: 'Scie d’aria perlacee sui compagni.', statuses: [sp('HASTE', 8, '%', 2, 'party')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Cooldown Red on Dodge', effect: '-1.5s CD se usata per fuggire da un telegraph rosso.', vfx: 'Flash perlaceo sul modello.', statuses: [] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Salto della Falesia', effect: 'TP permette di scavalcare dislivelli fino a Quota +2 senza scale.', vfx: 'Hit-Stop 3 frame, rosa dei venti d’aria.', statuses: [] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: 'Collasso Dimensionale',
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 60.0,
      baseSummary: 'Singolarità 6m (gittata 10m, 4.0s): 22 danni caos, attrazione verso il centro e SLOW -12%.',
      tier1: { title: 'T1 · Collasso Base', effect: 'Area 6m (4.0s), 22 danni, pull e SLOW -12%.', vfx: 'Singolarità nero-magenta a terra.' },
      tier2: { title: 'T2 · Tensione Spaziale', effect: '-10% startup; +2 danno caos.', vfx: 'Linee di forza convergenti.' },
      branches: [
        {
          branch: 'A',
          name: 'Buco Nero (Attrazione & Break)',
          focus: 'Pull ritmico ogni 1.0s + 28 danni + -25 postura Boss',
          tier3: { title: '3A · Attrazione Inesorabile', effect: 'Impulso pull 1.5m ogni 1.0s + 28 danni.', vfx: 'Singolarità nero-magenta pulsante.', statuses: [sp('DISPLACE', 1.5, 'm/s pull', 4)] },
          tier4: { title: '4A · Postura Boss -25', effect: 'Rimuove 25 punti postura se Boss resta >=2s.', vfx: 'Fratture geometriche a terra.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: "Singolarità d'Alba", effect: 'Colonna dorata all’epicentro: VULNERABLE +10% (4.0s).', vfx: 'Decal dorata #FFD166 + raggio unlit.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Crit in Luce', effect: 'Party ha +8% Crit Rate sui mob compattati nella luce.', vfx: 'Raggi dorati lineari a terra.', statuses: [sp('EMPOWER', 8, '% crit', 4, 'party')] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: "L'Alba del Vuoto", effect: 'Boss in Break: implosione finale +12 danni e +1.5s Break.', vfx: 'Hit-Stop 3 frame, colonna d’oro solida.', statuses: [] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: "Maelstrom dell'Eclisse", effect: 'Pull 2m + DOT 3 dmg/s (4s).', vfx: 'Decal indaco/cremisi #9A031E.', statuses: [sp('DISPLACE', 2, 'm pull', 0.4), sp('DOT', 3, 'dmg/s', 4)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stealth Distanza', effect: 'Mob nella risacca perdono mira sugli alleati ranged.', vfx: 'Ombre allungate verso est.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 2, 'party')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: 'Abisso dello Jonio Caotico', effect: 'Al termine dei 4s, implosione atterra mob minori 1.2s.', vfx: 'Hit-Stop 3 frame, specchio d’acqua scuro.', statuses: [sp('STUN', 1.2, 's', 1.2)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Labirinto di Fratture (Controllo)',
          focus: '3 zone instabili, -10% atk speed e soppressione tiratori',
          tier3: { title: '3B · Tre Zone Instabili', effect: 'Stagger continuo e disorientamento nell’area.', vfx: 'Tre cerchi magenta interconnessi.', statuses: [sp('STUN', 0.4, 's/1.5s', 4)] },
          tier4: { title: '4B · Atk Speed Nemica Red', effect: '-10% velocità d’attacco nemica per tutta la durata.', vfx: 'Onde dimensionali lente.', statuses: [sp('SLOW', 10, '% atk', 4)] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Bagliore Fratture', effect: 'Tiratori nemici: -15% precisione (4s).', vfx: 'Lampi dorati geometrici.', statuses: [sp('SLOW', 15, '% acc', 4)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Haste Party', effect: 'Party dentro le fratture: HASTE +8% (3s).', vfx: 'Bordo oro sulle armature.', statuses: [sp('HASTE', 8, '%', 3, 'party')] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: "Baluardo d'Alba Caotica", effect: 'Distrugge istantaneamente tutti i proiettili nell’area.', vfx: 'Hit-Stop 3 frame, stella solare dorata.', statuses: [] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: 'Risacca Fratture', effect: 'SLOW -18% velocità di movimento.', vfx: 'Pozze scure bordate d’arancio.', statuses: [sp('SLOW', 18, '%', 4)] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Stamina in Pozza', effect: 'Party rigenera +12 stamina/s nelle fratture.', vfx: 'Increspature marine animate.', statuses: [sp('REGEN', 12, 'stam/s', 4, 'party')] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: "Silenzio dell'Abisso", effect: 'Nemici nella risacca subiscono Silenzio attacco 2.0s.', vfx: 'Hit-Stop 3 frame, pozza marea scura.', statuses: [sp('ROOT', 2, 's atk', 2)] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Porta di Salvezza (TP Emergenza)',
          focus: 'Portale di estrazione istantanea per il party + scudo 12–15 HP',
          tier3: { title: '3C · Varco Sicuro', effect: 'Party entro 8m: SHIELD 12 HP (4.5s) e HASTE +8%.', vfx: 'Portale orizzontale dorato-viola.', statuses: [sp('SHIELD', 12, 'HP', 4.5, 'party'), sp('HASTE', 8, '%', 4.5, 'party')] },
          tier4: { title: '4C · TP Emergenza Party', effect: 'Compagni possono interagire per TP istantaneo al varco.', vfx: 'Nodi di luce collegano i compagni.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: "Varco d'Alba", effect: 'Scudo 14 HP e purifica debuff slow.', vfx: 'Decal dorata + raggio unlit.', statuses: [sp('SHIELD', 14, 'HP', 4.5, 'party')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Ritorsione Luce', effect: 'Scudo colpito infligge 6 danni radiosi.', vfx: 'Scintilla dorata reattiva.', statuses: [] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: "Evasione Suprema d'Oriente", effect: 'Chi usa il varco ottiene 1.0s i-frame e SUPER_ARMOR 2.0s.', vfx: 'Hit-Stop 3 frame, pilastro d’oro solido.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 2, 'party')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: 'Marea del Ristoro', effect: 'Party protetto rigenera 2 HP/s (6 HP totali).', vfx: 'Decal indaco con riflessi arancio.', statuses: [sp('REGEN', 2, 'HP/s', 3, 'party')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Stamina Regen +15', effect: '+15 stamina/s ai compagni protetti.', vfx: 'Increspature calme a pavimento.', statuses: [sp('REGEN', 15, 'stam/s', 4.5, 'party')] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: "Risacca dell'Oblio", effect: 'Su danno letale al compagno: TP al varco a 1 HP + SHIELD 15 HP (1/sessione).', vfx: 'Hit-Stop 3 frame, specchio d’acqua calmo.', statuses: [sp('SHIELD', 15, 'HP', 4.5, 'party')] },
            ],
          },
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 9. DALÌTH
  // -------------------------------------------------------------------------
  {
    id: 'dalith',
    code: 'DA',
    name: 'Dalìth, la Dalisca dei Bassifondi',
    short: 'Dalìth',
    title: 'Evasion Tank · Coreografia & Miraggi',
    role: 'Spia Elusiva di Kaza-Massel • Taunt & Vulnerabilità',
    archetype: 'evasion_tank',
    home: 'Kaza-Massel',
    color: '#ec4899',
    hp: 105,
    stamina: 125,
    speed: 7.9,
    critBase: 16,
    weaponStyle: 'Veli di seta piombata (360°, 2.5–3.0m) · Schivate perfette & Taunt inverso',
    passiveExpansion: {
      innatePassive: 'Danza della Memoria: schivate perfette aprono finestre i-frame che generano miraggi e provocano il Boss.',
      passiveBranchName: 'Passiva · Passo dei Bassifondi',
      passiveTiers: [
        { tier: 1, name: 'Seta Piombata I', effect: '+10% probabilità di schivata passiva sui colpi leggeri nemici.', gemCost: 45 },
        { tier: 2, name: 'Grazia i-Frame II', effect: 'Finestra della Schivata Perfetta estesa di +0.08s.', gemCost: 90 },
        { tier: 3, name: 'Eco Coreografico III', effect: 'Ogni Schivata Perfetta applica -4% danno subito dal party per 2.5s.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Seta dell’Eclisse Speculare',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Dalìth',
        gemCost: 220,
        effect: 'Ogni Schivata Perfetta durante Danza della Memoria [R] attiva automaticamente una Rotazione dei Veli [E] gratuita (0 Stamina, no CD) mantenendo l’aggro del Boss su Dalìth.',
        synergyTag: 'Evasion-Tank autoregolante per tenere i Boss lontani dai tiratori',
      },
    },
    specialE: {
      slot: 'E',
      name: 'Rotazione dei Veli',
      resource: 'Stamina',
      resourceCost: 18,
      cooldownSec: 6.5,
      baseSummary: 'Veli a 360° (2.8m): 16 danni contusivi, deflette proiettili leggeri e Stagger leggero.',
      tier1: { title: 'T1 · Rotazione Base', effect: '16 danni, raggio 2.8m, deflette proiettili leggeri.', vfx: 'Cerchio di seta violetto-bluastro.' },
      tier2: { title: 'T2 · Leggerezza di Seta', effect: 'Costo ridotto a 15 Stamina; +2 danno piatto (18).', vfx: 'Nastro di seta con filo metallico lucido.' },
      branches: [
        {
          branch: 'A',
          name: 'Veli Taglienti (Esposizione)',
          focus: 'VULNERABLE +6–8% amplificato dalla Schivata Perfetta',
          tier3: { title: '3A · Punte Metalliche', effect: '24 danni al prioritario + VULNERABLE +6% (3.0s).', vfx: 'Spirale di seta affilata a terra.', statuses: [sp('VULNERABLE', 6, '%', 3)] },
          tier4: { title: '4A · Vulnerable on Dodge', effect: 'Dopo Schivata Perfetta, debuff sale a +8%.', vfx: 'Flash viola brillante al punto d’innesco.', statuses: [sp('VULNERABLE', 8, '%', 3)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: 'Veli di Favonio', effect: 'DOT calore 3 dmg/s (3s).', vfx: 'Scia arancio-fuoco #D94E1F + calce.', statuses: [sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Armor Crack Boss', effect: '-6% armatura Boss (3s).', vfx: 'Fiammata arancione sul target.', statuses: [sp('VULNERABLE', 6, '% armor', 3)] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: "Taglio d'Africo", effect: 'Sotto 25% HP: +10 danni netti; kill ripristina 15 Stamina.', vfx: 'Hit-Stop 3 frame, spacco calce bruciata.', statuses: [sp('REGEN', 15, 'stam', 1, 'self')] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Seta di Brina', effect: 'SLOW -12% (2.5s) e -6% atk speed.', vfx: 'Nastri di ghiaccio azzurro #A8DADC.', statuses: [sp('SLOW', 12, '%', 2.5)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Freeze CD Boss', effect: 'Se stordito, congela cooldown Boss per 1.0s.', vfx: 'Bordo brinato sul Boss.', statuses: [] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Presa del Grecale', effect: 'Se già rallentato: ROOT 1.2s sul posto.', vfx: 'Hit-Stop 3 frame, blocco calcare ghiacciato.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Turbine di Seta', effect: 'Spinge via i mob circostanti di 1.5m.', vfx: 'Linee d’aria perlacee a pavimento.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Haste Dalìth', effect: 'HASTE +8% move speed (2s) dopo rotazione.', vfx: 'Micro-scie attorno alle caviglie.', statuses: [sp('HASTE', 8, '%', 2, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Ciclone dei Bassifondi', effect: 'Atterra sul posto tutti i mob minori per 1.0s.', vfx: 'Hit-Stop 3 frame, anello elicoidale.', statuses: [sp('STUN', 1.0, 's', 1.0)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Danza di Cortina (Miraggio)',
          focus: 'Velo illusorio 3.5m con Stealth Camo e Taunt su esca',
          tier3: { title: '3B · Velo Illusorio', effect: 'STEALTH_CAMO per Dalìth + mob attaccano miraggio (3.0s).', vfx: 'Decal con figura danzante sfumata.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 3, 'self')] },
          tier4: { title: '4B · Stagger on Miss', effect: 'Nemici che mancano il miraggio: Stagger 0.5s.', vfx: 'Cerchi d’urto violacei a terra.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Miraggio di Calce', effect: 'DOT 2 dmg/s a chi attacca il miraggio.', vfx: 'Decal aranciata calda con fumo.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'Empower Uscita', effect: '+6% EMPOWER al prossimo attacco.', vfx: 'Scintille arancioni sulle punte veli.', statuses: [sp('EMPOWER', 6, '%', 2, 'self')] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Illusione di Calce Viva', effect: 'Mob che attaccano il miraggio: -8% armatura (3.0s).', vfx: 'Hit-Stop 3 frame, fiammata piatta.', statuses: [sp('VULNERABLE', 8, '% armor', 3)] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Miraggio di Brina', effect: 'Alla distruzione rilascia lastra blocca-dash 1.5s.', vfx: 'Lastra brina trasparente.', statuses: [sp('ROOT', 1.5, 's dash', 1.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Durata Lastra 3.5s', effect: 'Estende durata lastra a 3.5s.', vfx: 'Cristalli di sale ai bordi.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: 'Specchio di Ghiaccio Carsico', effect: 'Mob minori che colpiscono miraggio: ROOT 1.2s.', vfx: 'Hit-Stop 3 frame, mandala brina solido.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: 'Raffica Miraggio', effect: 'Miraggio esplode spingendo mob minori di 2.0m.', vfx: 'Anello d’aria perlaceo espanso.', statuses: [sp('DISPLACE', 2, 'm', 0.3)] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Haste Compagni', effect: 'Alleati vicini al miraggio: HASTE +6% (2s).', vfx: 'Micro-scie sui piedi alleati.', statuses: [sp('HASTE', 6, '%', 2, 'party')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: "Muro d'Aria della Dalisca", effect: 'Miraggio deflette tutti i proiettili per tutta la durata.', vfx: 'Hit-Stop 3 frame, cupola d’aria piatta.', statuses: [] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Passo Ipnotico (Evasion Tanking)',
          focus: 'Taunt rigido 6m + +15% Evasion + reset su Schivata Perfetta',
          tier3: { title: '3C · Passo Provocatorio', effect: 'Taunt rigido 3.0s entro 6m + SHIELD 8 HP (3.5s).', vfx: 'Decal viola scuro + Rim-Light indaco.', statuses: [sp('SHIELD', 8, 'HP', 3.5, 'self')] },
          tier4: { title: '4C · Dodge Chance +15%', effect: 'Con scudo attivo, +15% probabilità di schivata.', vfx: 'Silhouette si sdoppia leggermente.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Ritorsione Termica', effect: 'Mob che mancano Dalìth subiscono 3 danni.', vfx: 'Scintille arancioni reattive.', statuses: [] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Stamina on Dodge', effect: 'Ogni schivata con scudo recupera +10 Stamina.', vfx: 'Flash arancione sul petto.', statuses: [sp('REGEN', 10, 'stam', 1, 'self')] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: 'Favonio della Memoria', effect: 'Con scudo attivo: party entro 6m guadagna +6% EMPOWER.', vfx: 'Hit-Stop 3 frame, sigillo calce bruciata.', statuses: [sp('EMPOWER', 6, '%', 3.5, 'party')] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: 'Gelo Ipnotico', effect: 'Attaccanti dello scudo: -8% atk speed (2.5s).', vfx: 'Bordo brinato sull’attaccante.', statuses: [sp('SLOW', 8, '% atk', 2.5)] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Scudo Potenziato', effect: 'Scudo sale a 10 HP.', vfx: 'Guscio di brina compatto.', statuses: [sp('SHIELD', 10, 'HP', 3.5, 'self')] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: "Danza d'Inverno", effect: 'La Schivata Perfetta azzera istantaneamente il CD di [E].', vfx: 'Hit-Stop 3 frame, prisma azzurro piatto.', statuses: [] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Agilità di Seta', effect: 'Con scudo attivo: HASTE +8% move speed (3.0s).', vfx: 'Micro-folate attorno alle caviglie.', statuses: [sp('HASTE', 8, '%', 3, 'self')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Dash Cost Red', effect: '-20% costo dash durante lo scudo.', vfx: 'Turbinio d’aria sui calzari.', statuses: [sp('HASTE', 20, '% dash', 3, 'self')] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Evasione Implacabile', effect: 'Immunità a rallentamenti e radicamenti per 3.0s netti.', vfx: 'Hit-Stop 3 frame, rosa dei venti d’aria.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 3, 'self')] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: 'Danza della Memoria',
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 60.0,
      baseSummary: 'Coreografia 7m (4.5s): 3 onde concentriche di seta (20 danni), Taunt su di sé e SUPER_ARMOR.',
      tier1: { title: 'T1 · Danza Base', effect: '3 onde da 20 danni (7m), Taunt su sé, SUPER_ARMOR.', vfx: 'Onde di seta concentriche violette.' },
      tier2: { title: 'T2 · Ritmo dei Bassifondi', effect: '-10% startup; +2 danno per onda.', vfx: 'Fili piombati lucidi sul bordo.' },
      branches: [
        {
          branch: 'A',
          name: 'Seta Tagliente (Esposizione & Break)',
          focus: '-8% armatura, -25 postura Boss e VULNERABLE',
          tier3: { title: '3A · Lame di Seta', effect: '-8% armatura (4.5s) e -25 postura Boss.', vfx: 'Fendenti concentrici violetti.', statuses: [sp('VULNERABLE', 8, '% armor', 4.5)] },
          tier4: { title: '4A · Stagger Pesante 3a Onda', effect: 'Colpiti da tutte e 3 le onde: Stagger pesante 0.8s.', vfx: 'Flash metallici sulle creste.', statuses: [sp('STUN', 0.8, 's', 0.8)] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: 'Danza del Sole Nascente', effect: 'Colonna dorata 6m: VULNERABLE +10% (4.0s).', vfx: 'Decal dorata #FFD166 + raggio unlit.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Crit in Luce', effect: 'Party nella luce: +8% Crit Rate.', vfx: 'Fregio dorato sulle armi alleati.', statuses: [sp('EMPOWER', 8, '% crit', 4, 'party')] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: "L'Alba della Dalisca", effect: 'Boss in Break: onda finale +12 danni e +1.5s Break.', vfx: 'Hit-Stop 3 frame, colonna d’oro solida.', statuses: [] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: 'Danza del Crepuscolo Jonico', effect: 'Pull 2m verso Dalìth + DOT 3 dmg/s (4s).', vfx: 'Decal indaco/cremisi #9A031E.', statuses: [sp('DISPLACE', 2, 'm pull', 0.4), sp('DOT', 3, 'dmg/s', 4)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stamina in Pozza', effect: 'Dalìth rigenera +15 stamina/s mentre danza.', vfx: 'Onde scure animate a terra.', statuses: [sp('REGEN', 15, 'stam/s', 4.5, 'self')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: 'Risacca degli Abissi', effect: 'Implosione finale atterra mob minori 1.2s.', vfx: 'Hit-Stop 3 frame, specchio d’acqua scuro.', statuses: [sp('STUN', 1.2, 's', 1.2)] },
            ],
          },
        },
        {
          branch: 'B',
          name: "Ipnotismo d'Ombra (Controllo)",
          focus: 'Ipnosi 2.5s senza danno nemico + riduzione danno -10%',
          tier3: { title: '3B · Coreografia Ipnotica', effect: 'Mob minori smettono di attaccare e barcollano verso Dalìth per 2.5s.', vfx: 'Cerchi concentrici violacei ipnotici.', statuses: [sp('STUN', 2.5, 's charm', 2.5)] },
          tier4: { title: '4B · Danno Nemico Red', effect: '-10% danno inferto nell’area (4.0s).', vfx: 'Alone scuro desaturato sui mob.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Bagliore Ipnotico', effect: 'Tiratori nemici: -15% precisione (4s).', vfx: 'Onda dorata circolare piatta.', statuses: [sp('SLOW', 15, '% acc', 4)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Super-Armor Danza', effect: 'SUPER_ARMOR per tutta la durata della danza.', vfx: 'Contorno dorato solido.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 4.5, 'self')] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: "Faro d'Oriente", effect: 'Distrugge istantaneamente tutti i proiettili nell’area.', vfx: 'Hit-Stop 3 frame, stella solare dorata.', statuses: [] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: 'Risacca Ipnotica', effect: 'SLOW -18% e blocco scatti.', vfx: 'Pozza scura bordata d’arancio.', statuses: [sp('SLOW', 18, '%', 4.5), sp('ROOT', 1.5, 's dash', 4.5)] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Estensione Debuff', effect: 'Debuff danno nemico esteso a 5.0s.', vfx: 'Bordi sfumati indaco scuro.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: 'Crepuscolo Ipnotico', effect: 'Mob minori nella risacca subiscono Silenzio attacco 2.0s.', vfx: 'Hit-Stop 3 frame, pozza marea scura.', statuses: [sp('ROOT', 2, 's atk', 2)] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Velo di Grazia (Evasione Party)',
          focus: 'Scudo 12–15 HP, +15% Dodge Party e salvataggio al centro',
          tier3: { title: '3C · Cupola di Seta', effect: 'SHIELD 12 HP (4.5s) e HASTE +8% al party nell’area.', vfx: 'Cupola seta violacea semitrasparente.', statuses: [sp('SHIELD', 12, 'HP', 4.5, 'party'), sp('HASTE', 8, '%', 4.5, 'party')] },
          tier4: { title: '4C · Dodge Chance Party', effect: 'Alleati nei veli: +15% probabilità di schivare colpi leggeri.', vfx: 'Scie di seta leggere attorno ai compagni.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: 'Velo del Sole Nascente', effect: 'Scudo 14 HP e purifica debuff slow.', vfx: 'Decal dorata + raggio unlit.', statuses: [sp('SHIELD', 14, 'HP', 4.5, 'party')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Ritorsione Luce', effect: 'Scudo colpito infligge 6 danni radiosi.', vfx: 'Lampo dorato reattivo.', statuses: [] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: "Santuario d'Alba", effect: 'Party ottiene SUPER_ARMOR per 2.0s netti.', vfx: 'Hit-Stop 3 frame, pilastro d’oro solido.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 2, 'party')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: 'Marea della Dalisca', effect: 'Party rigenera 2 HP/s (3s) + 12 stamina/s.', vfx: 'Decal indaco con riflessi arancio.', statuses: [sp('REGEN', 2, 'HP/s', 3, 'party')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Durata Scudo 5.5s', effect: 'Estende durata scudo a 5.5s.', vfx: 'Increspature calme a pavimento.', statuses: [] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: 'Risacca della Salvezza', effect: 'Su danno letale al compagno: TP al centro a 1 HP + SHIELD 15 HP (1/sessione).', vfx: 'Hit-Stop 3 frame, specchio d’acqua calmo.', statuses: [sp('SHIELD', 15, 'HP', 5, 'party')] },
            ],
          },
        },
      ],
    },
  },
];

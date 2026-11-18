import type { HeroSpec, StatusPayload } from './types';

const sp = (
  type: StatusPayload['type'],
  intensity: number,
  unit: string,
  durationSec: number,
  target: StatusPayload['target'] = 'enemy',
): StatusPayload => ({ type, intensity, unit, durationSec, target });

export const HEROES_PART_1: HeroSpec[] = [
  // -------------------------------------------------------------------------
  // 1. ALBERETH
  // -------------------------------------------------------------------------
  {
    id: 'albereth',
    code: 'AL',
    name: "Albereth, l'Ombra Cornuta",
    short: 'Albereth',
    title: 'Assassino Chirurgico · Flanker',
    role: 'Satiro • Bardo dei Sussurri / Ladro',
    archetype: 'skirmisher',
    home: 'Mur',
    color: '#a855f7',
    hp: 85,
    stamina: 120,
    speed: 8.0,
    critBase: 18,
    weaponStyle: 'Doppi pugnali corti + ocarina d’osso · Backstab +200% arco 180°',
    passiveExpansion: {
      innatePassive: 'Ombra danzante: colpi alle spalle ×2 danni, elusione 15%, +velocità aura vicini.',
      passiveBranchName: 'Passiva · Passo del Satiro',
      passiveTiers: [
        { tier: 1, name: 'Passo Silente I', effect: '+4% Move Speed base e -10% rumore d’aggro sui fianchi.', gemCost: 45 },
        { tier: 2, name: 'Lama d’Occasione II', effect: 'Arco valido di Backstab ampliato da 180° a 200°.', gemCost: 90 },
        { tier: 3, name: 'Elusione Istintiva III', effect: 'Ogni schivata riuscita rigenera +8 Stamina immediati.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Eco dell’Ocarina Spezzata',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Albereth',
        gemCost: 220,
        effect: 'Il primo Backstab dopo Passo d’Ombra [E] applica automaticamente il Tag Primer del Vento scelto su [E] per 4.0s senza consumare il cooldown.',
        synergyTag: 'Self-Primer garantito per Rotation Weaving & Burst',
      },
    },
    specialE: {
      slot: 'E',
      name: "Passo d'Ombra",
      resource: 'Stamina',
      resourceCost: 20,
      cooldownSec: 8.0,
      baseSummary: 'Scatto fulmineo 4m con 0.3s i-frame attraverso i mob leggeri; 18 danni fisici.',
      tier1: { title: 'T1 · Passo Base', effect: 'Danno 18, portata 4.0m, i-frame 0.3s.', vfx: 'Scia grigio-fumo sottile all’avvio.' },
      tier2: { title: 'T2 · Flusso Cinetico', effect: 'Costo ridotto a 18 Stamina; +2 danno piatto (20).', vfx: 'Scia cinetica nera corta sull’arma.' },
      branches: [
        {
          branch: 'A',
          name: 'Assassino Letale (Spalle / Burst)',
          focus: 'Danno singolo e finestra Backstab contro Élite/Boss',
          tier3: { title: '3A · Affondo alle Spalle', effect: '26 danni alle spalle + Stagger leggero 0.4s.', vfx: 'Decal circolare grigia (1.5m) con lama spezzata.', statuses: [sp('STUN', 0.4, 's', 0.4)] },
          tier4: { title: '4A · Riduzione CD Spalle', effect: '-1.5s cooldown se colpisce alle spalle Élite o Boss.', vfx: 'Scia d’ombra densa con micro-schegge nere.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: "Lama d'Affanno", effect: 'Applica DOT Scirocco (3 dmg/s × 3.0s).', vfx: 'Scia arancio-fuoco #D94E1F + scorie a pavimento.', statuses: [sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Stamina on Crit', effect: 'Critico alle spalle su DoT restituisce 10 Stamina.', vfx: 'Bagliore arancione pulsante sui pugnali.', statuses: [sp('REGEN', 10, 'stam', 1, 'self')] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: 'Colpo di Coda di Favonio', effect: 'Sotto 25% HP: +8 danni netti e detona il DoT istantaneamente.', vfx: 'Hit-Stop 3 frame, crepa emissiva a terra.', statuses: [sp('EMPOWER', 8, 'dmg', 1, 'self')] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Pugnale di Brina', effect: 'Applica SLOW -12% (2.5s) e -6% armatura.', vfx: 'Lampo bianco-azzurro #A8DADC + ghiaccio a terra.', statuses: [sp('SLOW', 12, '%', 2.5)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Slow Atk Boss', effect: 'Riduce la velocità d’attacco del Boss del 6%.', vfx: 'Bordo brinato persistente sul Boss.', statuses: [sp('SLOW', 6, '% atk', 2.5)] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Spacco del Nord', effect: 'Applica VULNERABLE +10% per 3.0s.', vfx: 'Hit-Stop 3 frame, prisma di ghiaccio azzurro piatto.', statuses: [sp('VULNERABLE', 10, '%', 3)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Fendente di Burrasca', effect: 'Avanza +1.5m oltre il target e ottiene HASTE +8% (2s).', vfx: 'Linee d’aria compressa perlacee #E0E1DD.', statuses: [sp('HASTE', 8, '%', 2, 'self')] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Dash Cost Red', effect: 'Costo del dash successivo ridotto del 15%.', vfx: 'Vortice di polvere rotante sui calzari.', statuses: [sp('HASTE', 15, '% dash', 2, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Turbine del Canale', effect: 'Atterra sul posto i mob normali alle spalle per 1.0s.', vfx: 'Hit-Stop 3 frame, anello elicoidale a pavimento.', statuses: [sp('STUN', 1.0, 's', 1.0)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Inganno Spaziale (Cortina & Smoke)',
          focus: 'Controllo d’area, Stealth Camo e disimpegno di gruppo',
          tier3: { title: '3B · Cortina Fumogena', effect: 'Raggio 2m (2.5s) che conferisce STEALTH_CAMO ad Albereth.', vfx: 'Decal ellittica grigio scuro a terra.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 2.5, 'self')] },
          tier4: { title: '4B · Cortina Slow', effect: 'I nemici nella cortina subiscono SLOW -10% (2.0s).', vfx: 'Fumo opaco denso < 1m a terra.', statuses: [sp('SLOW', 10, '%', 2.0)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Fumo Calcinato', effect: 'Cortina infligge DOT 2 dmg/s ai mob all’interno.', vfx: 'Fumo aranciato con calce fumante.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'Burst Uscita', effect: '+6% danno al primo attacco entro 2s dall’uscita.', vfx: 'Fregio emissivo arancio sui pugnali.', statuses: [sp('EMPOWER', 6, '%', 2, 'self')] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Cappa di Calce Viva', effect: 'Riduce armatura dei mob nella cortina dell’8% (3s).', vfx: 'Hit-Stop 3 frame, decal bruciata permanente.', statuses: [sp('VULNERABLE', 8, '%', 3)] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Vapore Freddo', effect: 'Congela i piedi dei nemici bloccando il dash per 1.5s.', vfx: 'Nebbia di vapore freddo azzurrina.', statuses: [sp('ROOT', 1.5, 's', 1.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Estensione Slow', effect: 'Estende durata dello slow a 3.0s.', vfx: 'Cristalli di brina sui bordi decal.', statuses: [sp('SLOW', 10, '%', 3)] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: 'Silenzio del Grecale', effect: 'Zittisce abilità speciali dei mob minori per 2.0s.', vfx: 'Hit-Stop 3 frame, sigillo di ghiaccio a terra.', statuses: [sp('ROOT', 2, 's', 2)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: 'Spinta Cortina', effect: 'Micro-spinta esterna di 1.5m a tutti i mob vicini.', vfx: 'Raffica di vento circolare perlacea.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Haste Compagni', effect: 'Compagni che attraversano la cortina: HASTE +8% (2s).', vfx: 'Micro-nastri d’aria sulle caviglie alleati.', statuses: [sp('HASTE', 8, '%', 2, 'party')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: 'Occhio della Bufera', effect: 'Un dash gratuito (0 stamina) nei successivi 2s.', vfx: 'Hit-Stop 3 frame, rosa dei venti d’aria a terra.', statuses: [sp('HASTE', 100, '% free', 2, 'self')] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Supporto Tattico (Marchio Preda)',
          focus: 'Vulnerabilità mirata e rigenerazione stamina per il party',
          tier3: { title: '3C · Marchio della Preda', effect: 'Bersaglio riceve VULNERABLE +6% dal party per 4.0s.', vfx: 'Decal con occhio geometrico sotto il bersaglio.', statuses: [sp('VULNERABLE', 6, '%', 4)] },
          tier4: { title: '4C · Stamina on Hit', effect: 'Attacchi dei compagni sul marchiato rigenerano 3 Stamina.', vfx: 'Scintille bianche verso gli alleati.', statuses: [sp('REGEN', 3, 'stam/hit', 4, 'party')] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Marchio Bruciante', effect: 'Marchiato emette DOT 2 dmg/s ai mob entro 2m.', vfx: 'Sabbia rossa e brace a terra.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Reset on Kill', effect: 'Se il marchiato muore: +15 Stamina e 1 dash.', vfx: 'Flash arancione sul modello.', statuses: [sp('REGEN', 15, 'stam', 1, 'self')] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: "Condanna d'Africo", effect: 'Sotto 25% HP il marchio sale a VULNERABLE +10%.', vfx: 'Hit-Stop 3 frame, sigillo di calce bruciata.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: 'Scheggiatura Brina', effect: 'Colpi alleati sul marchiato aggiungono micro-stagger.', vfx: 'Schegge di ghiaccio secche all’impatto.', statuses: [sp('SLOW', 10, '%', 2.5)] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Danno Boss Red', effect: 'Riduce del 6% il danno inferto dal bersaglio marchiato.', vfx: 'Alone azzurrino opaco sul Boss.', statuses: [sp('SLOW', 6, '% dmg', 3)] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: 'Sigillo di Cava Gelida', effect: 'Alla scadenza del marchio: STUN 0.8s (0.4s Boss).', vfx: 'Hit-Stop 3 frame, blocco brina a terra.', statuses: [sp('STUN', 0.8, 's', 0.8)] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Aura di Velocità', effect: 'Move speed del party entro 6m +6% per 2.5s.', vfx: 'Scie d’aria bianca sotto i piedi del party.', statuses: [sp('HASTE', 6, '%', 2.5, 'party')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Raggio Aura 8m', effect: 'Estende l’aura di velocità da 6m a 8m.', vfx: 'Anello d’aria perlaceo espanso.', statuses: [sp('HASTE', 6, '%', 2.5, 'party')] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Ruggito della Scogliera', effect: 'Kill del marchiato conferisce SHIELD 8 HP al party (3.0s).', vfx: 'Hit-Stop 3 frame, alone protettivo perlaceo.', statuses: [sp('SHIELD', 8, 'HP', 3, 'party')] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: "Melodia dell'Inganno",
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 55.0,
      baseSummary: 'Suona l’ocarina: 2 copie illusorie distraggono i mob per 3.0s; 22 danni sonori a cono 4m.',
      tier1: { title: 'T1 · Melodia Base', effect: '2 copie Taunt 3.0s, cono 4m, 22 danni sonori.', vfx: 'Due miraggi ombra con cerchi sonori.' },
      tier2: { title: "T2 · Flusso d'Ocarina", effect: '-10% startup frames; +2 danno piatto (24).', vfx: 'Onda acustica più nitida a terra.' },
      branches: [
        {
          branch: 'A',
          name: 'Ombra Tagliente (Burst & Finisher)',
          focus: 'Concentrazione di danno + finestra Break',
          tier3: { title: '3A · Attacco all’Unisono', effect: 'Le 2 copie colpiscono insieme per 28 danni concentrati.', vfx: 'Tre sagome convergenti.', statuses: [] },
          tier4: { title: '4A · Perforazione 10%', effect: 'Ignora il 10% dell’armatura nemica.', vfx: 'Fendenti a forbice neri.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: "Luce dell'Imboscata", effect: 'Colonna dorata 6m: VULNERABLE +10% (4.0s).', vfx: 'Decal stella 8 punte #FFD166 + Rim-Light oro.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Crit in Luce', effect: '+8% Crit Rate dentro la luce di Levante.', vfx: 'Lame dorate sui pugnali.', statuses: [sp('EMPOWER', 8, '% crit', 4, 'self')] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: "L'Alba dell'Ombra", effect: 'Boss in Break dentro luce: Backstab +10 danni netti.', vfx: 'Hit-Stop 3 frame, raggio zenitale unico.', statuses: [sp('EMPOWER', 10, 'dmg', 4, 'self')] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: 'Risacca del Tradimento', effect: 'Pozza 6m: pull 2.0m verso centro + DOT 3 dmg/s (3s).', vfx: 'Decal indaco/cremisi #9A031E + Rim-Light posteriore.', statuses: [sp('DISPLACE', 2, 'm pull', 0.4), sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stamina in Pozza', effect: 'Rigenera +15 stamina/sec nella pozza.', vfx: 'Cerchi d’acqua scura concentrici.', statuses: [sp('REGEN', 15, 'stam/s', 3, 'self')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: "Inganno d'Ossidiana", effect: 'Esplosione finale atterra mob minori per 1.2s.', vfx: 'Hit-Stop 3 frame, distorsione crepuscolare.', statuses: [sp('STUN', 1.2, 's', 1.2)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Danza di Specchi (Evasione & Controllo)',
          focus: 'Taunt rigoroso, accecamento tiratori e fuga',
          tier3: { title: '3B · Taunt Rigido', effect: 'Copie attirano tutti i mob minori per 3.0s.', vfx: 'Onde sonore concentriche sui miraggi.', statuses: [] },
          tier4: { title: '4B · Frantumazione Slow', effect: 'Copia distrutta applica SLOW -12% (2.5s).', vfx: 'Frammenti vitrei piatti a terra.', statuses: [sp('SLOW', 12, '%', 2.5)] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Bagliore Accecante', effect: 'Tiratori nemici subiscono -15% precisione (3s).', vfx: 'Raggio dorato radente a terra.', statuses: [sp('SLOW', 15, '% acc', 3)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Empower Party', effect: 'Alleati vicini alla copia: EMPOWER +6% (3s).', vfx: 'Bordo oro sottile sulle armi.', statuses: [sp('EMPOWER', 6, '%', 3, 'party')] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: "Gloria d'Oriente", effect: 'Ripristina 20 Stamina al party entro 8m.', vfx: 'Hit-Stop 3 frame, rosa dei venti d’oro.', statuses: [sp('REGEN', 20, 'stam', 1, 'party')] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: 'Risacca di Fuga', effect: 'Conferisce STEALTH_CAMO ai compagni vicini per 2s.', vfx: 'Ombre estese verso est + desaturazione.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 2, 'party')] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Estensione Taunt', effect: 'Estende la durata del Taunt delle copie di +1.0s.', vfx: 'Anello d’acqua pulsante 0.5 Hz.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: 'Tramonto Illusorio', effect: 'Distruzione di entrambe le copie: Boss perde aggro e -15 postura.', vfx: 'Hit-Stop 3 frame, riflesso solare rosso piatto.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Canto di Rivolta (Supporto Morale)',
          focus: 'Scudi di squadra, purificazione e Super-Armor',
          tier3: { title: '3C · Scudo Corale', effect: 'Party entro 8m: SHIELD 8 HP (3.5s) e HASTE +8%.', vfx: 'Decal circolare con note arcaiche.', statuses: [sp('SHIELD', 8, 'HP', 3.5, 'party'), sp('HASTE', 8, '%', 3.5, 'party')] },
          tier4: { title: '4C · Riduzione Costi Party', effect: '-10% costo stamina durante lo scudo.', vfx: 'Rim-Light bianco tenue sui compagni.', statuses: [sp('HASTE', 10, '% stam', 3.5, 'party')] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: 'Inno del Sole Nascente', effect: 'Scudo sale a 10 HP + purifica 1 slow attivo.', vfx: 'Bagliore dorato caldo + raggi solari.', statuses: [sp('SHIELD', 10, 'HP', 3.5, 'party')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Ritorsione Luce', effect: 'Scudo colpito da attacco pesante riflette 8 danni radiosi.', vfx: 'Scintilla dorata all’impatto.', statuses: [] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: 'Aurora Invitta', effect: 'Conferisce SUPER_ARMOR al party per 1.5s.', vfx: 'Hit-Stop 3 frame, pilastro d’oro zenitale.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 1.5, 'party')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: "Nenia dell'Onda Calma", effect: 'Party rigenera 2 HP/s per 3.0s (6 HP totali).', vfx: 'Decal azzurro-indaco con increspature.', statuses: [sp('REGEN', 2, 'HP/s', 3, 'party')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Resistenze Party', effect: '+6% resistenza ai danni per tutta la durata.', vfx: 'Bordo indaco sui personaggi protetti.', statuses: [sp('SHIELD', 6, '% DR', 3, 'party')] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: 'Pace dello Jonio', effect: 'Recupero istantaneo +25 Stamina e 1 carica secondaria al party.', vfx: 'Hit-Stop 3 frame, specchio d’acqua crepuscolare.', statuses: [sp('REGEN', 25, 'stam', 1, 'party')] },
            ],
          },
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 2. JUSEF
  // -------------------------------------------------------------------------
  {
    id: 'jusef',
    code: 'JU',
    name: 'Jusef, il Menestrello d’Argento',
    short: 'Jusef',
    title: 'Supporto Tattico · Debuffer & Duellante',
    role: 'Mezzelfo • Bardo di Supporto e Controllo Dinamico',
    archetype: 'support',
    home: 'Costa Est',
    color: '#38bdf8',
    hp: 95,
    stamina: 115,
    speed: 7.4,
    critBase: 14,
    weaponStyle: 'Stocco da affondo + Liuto d’argento · Interruzione leggera & economia risorse',
    passiveExpansion: {
      innatePassive: 'Cadenza Armonica: ogni affondo di stocco andato a segno riduce di 0.3s il cooldown di Rintocco Discordante [E].',
      passiveBranchName: 'Passiva · Accordo della Compagnia',
      passiveTiers: [
        { tier: 1, name: 'Eco del Liuto I', effect: 'Raggio delle aure e degli scudi di Jusef aumentato di +1.5m.', gemCost: 45 },
        { tier: 2, name: 'Stocco Lesto II', effect: 'Recupera 4 Stamina per ogni nemico interrotto da un colpo.', gemCost: 90 },
        { tier: 3, name: 'Cadenza Perfetta III', effect: 'Applicare un debuff e un buff entro 4s attiva +6% EMPOWER personale.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Contrappunto dei Cinque Venti',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Jusef',
        gemCost: 220,
        effect: 'Quando Jusef innesca una Risonanza Catalyst con Armonia dell’Eclisse [R], l’ICD del Boss si riduce da 1.5s a 0.8s e tutto il party ottiene +10 Stamina.',
        synergyTag: 'Acceleratore di Risonanza di squadra (9-player Catalyst)',
      },
    },
    specialE: {
      slot: 'E',
      name: 'Rintocco Discordante',
      resource: 'Stamina',
      resourceCost: 18,
      cooldownSec: 7.0,
      baseSummary: 'Affondo di stocco con onda sonora a cono (5m, 60°): 16 danni sonori e interrupt colpi leggeri.',
      tier1: { title: 'T1 · Rintocco Base', effect: '16 danni, raggio 5m, interrupt colpi leggeri.', vfx: 'Cono sonoro grigio-argenteo piatto.' },
      tier2: { title: 'T2 · Risonanza d’Argento', effect: 'Cooldown ridotto a 6.3s; +2 danno piatto (18).', vfx: 'Ondine argentee più marcate sullo stocco.' },
      branches: [
        {
          branch: 'A',
          name: 'Stoccata di Precisione (Armor Crack)',
          focus: 'Burst singolo e riduzione armatura Élite/Boss',
          tier3: { title: '3A · Affondo Perforante', effect: '24 danni singoli e -8% armatura per 3.0s.', vfx: 'Linea d’impatto argentea rettilinea 4m.', statuses: [sp('VULNERABLE', 8, '% armor', 3)] },
          tier4: { title: '4A · Estensione Armor Crack', effect: 'Estende riduzione armatura a 4.0s su colpo frontale Élite.', vfx: 'Flash metallico sulla punta dello stocco.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: "Stocco d'Attrito", effect: 'Applica DOT calore 3 dmg/s per 3s.', vfx: 'Scia arancio-fuoco #D94E1F + sfrigolio sabbia.', statuses: [sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Empower Compagni', effect: 'Alleati che colpiscono il target: +6% EMPOWER (2s).', vfx: 'Micro-fiammata arancione sul target.', statuses: [sp('EMPOWER', 6, '%', 2, 'party')] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: "Punta d'Africo", effect: 'Applica VULNERABLE +10% (3.0s) contro armature pesanti.', vfx: 'Hit-Stop 3 frame, fessura di calce bruciata.', statuses: [sp('VULNERABLE', 10, '%', 3)] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Giunti di Brina', effect: 'Riduce velocità d’attacco bersaglio dell’8% (3s).', vfx: 'Punta stocco ricoperta di brina #A8DADC.', statuses: [sp('SLOW', 8, '% atk', 3)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Stagger Bonus', effect: 'Party infligge +10% danno alla postura del Boss.', vfx: 'Schegge di ghiaccio secche all’impatto.', statuses: [] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Frattura del Grecale', effect: 'Se già rallentato: ROOT 1.2s sul posto.', vfx: 'Hit-Stop 3 frame, dente calcareo ghiacciato.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Spinta di Punta', effect: 'Turbolenza rettilinea respinge di 1.5m.', vfx: 'Getto d’aria compressa bianco-grigio.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Disimpegno Rapido', effect: 'Balzo indietro gratuito di 2m a fine affondo.', vfx: 'Turbinio d’aria attorno ai calzari.', statuses: [sp('HASTE', 10, '%', 1.5, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Fendente del Canale', effect: 'Trapassa fino a 3 nemici in linea, disorientandoli 1.5s.', vfx: 'Hit-Stop 3 frame, scia ventosa perlacea.', statuses: [sp('STUN', 0.8, 's', 0.8)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Aria Polifonica (Area & CC)',
          focus: 'Onda circolare 4m, Stagger di gruppo e controllo spazio',
          tier3: { title: '3B · Onda Circolare', effect: 'Raggio 4m: 15 danni + SLOW -10% (2.5s).', vfx: 'Decal argentea con onde sinusoidali.', statuses: [sp('SLOW', 10, '%', 2.5)] },
          tier4: { title: '4B · Stagger Cerchio', effect: 'Mob minori subiscono Stagger garantito 0.5s.', vfx: 'Anello d’urto d’argento spesso.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Calce Risonante', effect: 'Area riscaldata 3.0s: DOT 2 dmg/s.', vfx: 'Decal aranciata con polvere fumante.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'Cecità Mob Minori', effect: 'Precisione a distanza dei mob nell’area -10%.', vfx: 'Nube calce opaca bassa < 0.8m.', statuses: [sp('SLOW', 10, '% acc', 3)] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Calore della Taranta', effect: 'Mob fermi nell’area >2s: detonazione termica 12 danni.', vfx: 'Hit-Stop 3 frame, sfogo arancione piatto.', statuses: [] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Lastra Polifonica', effect: 'Impedisce il dash ai nemici per 1.5s.', vfx: 'Lastra di brina semitrasparente.', statuses: [sp('ROOT', 1.5, 's dash', 1.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Durata Lastra 3.5s', effect: 'Estende durata lastra e slow a 3.5s.', vfx: 'Cristalli di sale e ghiaccio ai bordi.', statuses: [sp('SLOW', 12, '%', 3.5)] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: 'Silenzio del Ghiaccio Carsico', effect: 'Interrompe canalizzazioni dei Mini-Boss con successo garantito.', vfx: 'Hit-Stop 3 frame, mandala di ghiaccio.', statuses: [sp('STUN', 0.6, 's', 0.6)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: 'Sferzata 360°', effect: 'Allontana tutti i mob circostanti di 1.5m.', vfx: 'Cerchi d’aria concentrici perlacei.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Haste Compagni', effect: 'Alleati nell’area guadagnano HASTE +6% (2.0s).', vfx: 'Micro-scie di vento sotto i piedi.', statuses: [sp('HASTE', 6, '%', 2, 'party')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: 'Muro d’Aria del Bardo', effect: 'Deflette il primo proiettile nemico per ogni alleato nell’area.', vfx: 'Hit-Stop 3 frame, barriera d’aria circolare.', statuses: [sp('SHIELD', 8, 'proj', 3, 'party')] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Accordo d’Incoraggiamento (Risorse)',
          focus: 'Batteria di Stamina e Scudi per la squadra entro 6–8m',
          tier3: { title: '3C · Ricarica Corale', effect: '+12 Stamina e SHIELD 6 HP (3s) al party entro 6m.', vfx: 'Decal argentea morbida sotto il gruppo.', statuses: [sp('REGEN', 12, 'stam', 1, 'party'), sp('SHIELD', 6, 'HP', 3, 'party')] },
          tier4: { title: '4C · Soccorso Affanno', effect: 'Se un compagno era a 0 stamina, la ricarica sale a +18 Stamina.', vfx: 'Flash bianco-argento sul compagno.', statuses: [sp('REGEN', 18, 'stam', 1, 'party')] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Vigore Termico', effect: 'Party ottiene EMPOWER +6% danno fisico (3.0s).', vfx: 'Bordo arancione sulle armi alleate.', statuses: [sp('EMPOWER', 6, '%', 3, 'party')] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Micro-DoT Party', effect: 'Attacchi potenziati applicano 1 micro-DoT fuoco.', vfx: 'Scintille arancioni sui colpi alleati.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: 'Favonio Trionfale', effect: 'Compagni entro 6m ottengono +8% Crit Rate (3.0s).', vfx: 'Hit-Stop 3 frame, fiamma arancio incisa.', statuses: [sp('EMPOWER', 8, '% crit', 3, 'party')] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: 'Tempera di Mente', effect: 'Resistenza al rallentamento 30% per 3.0s.', vfx: 'Bordo azzurro chiaro sui compagni.', statuses: [sp('SUPER_ARMOR', 30, '% slowRes', 3, 'party')] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Scudo Potenziato', effect: 'Lo scudo dell’accordo sale a 8 HP.', vfx: 'Alone di brina compatto attorno ai compagni.', statuses: [sp('SHIELD', 8, 'HP', 3, 'party')] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: 'Egida della Tramontana', effect: 'Alla rottura dello scudo il compagno ottiene 1.0s SUPER_ARMOR.', vfx: 'Hit-Stop 3 frame, sigillo azzurro protettivo.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 1, 'party')] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Passo Leggero', effect: 'Costo dash del party ridotto del 15% per 3.0s.', vfx: 'Micro-folate perlacee sui piedi alleati.', statuses: [sp('HASTE', 15, '% dash', 3, 'party')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Raggio Accordo 8m', effect: 'Raggio d’azione sale da 6m a 8m.', vfx: 'Decal allargata con arabeschi d’argento.', statuses: [] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Vento in Poppa della Compagnia', effect: 'Ripristina istantaneamente 20 Stamina a tutto il party.', vfx: 'Hit-Stop 3 frame, rosa dei venti d’argento.', statuses: [sp('REGEN', 20, 'stam', 1, 'party')] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: "Armonia dell'Eclisse",
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 60.0,
      baseSummary: 'Sinfonia d’area 7m (4.0s): 20 danni sonori + SLOW -12% ai nemici; SHIELD 10 HP al party.',
      tier1: { title: 'T1 · Armonia Base', effect: 'Area 7m (4.0s), 20 danni, SLOW -12%, SHIELD 10 HP.', vfx: 'Decal circolare argento-dorata.' },
      tier2: { title: "T2 · Sinfonia d'Argento", effect: '-10% startup; +2 danno piatto (22).', vfx: 'Note armoniche nitide sul perimetro.' },
      branches: [
        {
          branch: 'A',
          name: 'Inno di Battaglia (Offensiva Gruppo)',
          focus: 'Buff danno e penetrazione armatura di raid',
          tier3: { title: '3A · Coro Offensivo', effect: 'Party nell’area ottiene EMPOWER +8% (4.0s).', vfx: 'Decal dorato-argentea con note giganti.', statuses: [sp('EMPOWER', 8, '%', 4, 'party')] },
          tier4: { title: '4A · Perforazione Party', effect: 'Colpi nell’area ignorano 8% armatura nemica.', vfx: 'Raggi argentati lineari a pavimento.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: "Alba d'Oriente", effect: 'Pilastro dorato centrale: VULNERABLE +10% (4.0s).', vfx: 'Rosa a 8 punte #FFD166 + Rim-Light oro.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Atk Speed Party', effect: '+6% velocità d’attacco al party nella luce.', vfx: 'Bordo oro splendente sulle armi.', statuses: [sp('HASTE', 6, '% atk', 4, 'party')] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: "Trionfo d'Otranto", effect: 'Boss in Break nella luce: durata Break estesa di +1.5s.', vfx: 'Hit-Stop 3 frame, raggio solare verticale.', statuses: [] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: 'Requiem dello Jonio', effect: 'Pozza crepuscolare: pull 2m + DOT 3 dmg/s (4s).', vfx: 'Decal indaco/rosso #9A031E + Rim-Light cremisi.', statuses: [sp('DISPLACE', 2, 'm pull', 0.4), sp('DOT', 3, 'dmg/s', 4)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stamina in Pozza', effect: 'Compagni rigenerano +12 stamina/s nella risacca.', vfx: 'Onde marine scure a pavimento.', statuses: [sp('REGEN', 12, 'stam/s', 4, 'party')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: 'Crepuscolo del Bardo', effect: 'Windup degli attacchi nemici nella pozza +15% più lenti.', vfx: 'Hit-Stop 3 frame, specchio d’acqua scura.', statuses: [sp('SLOW', 15, '% windup', 4)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Dissonanza Tossica (Controllo)',
          focus: 'Interruzione continua e riduzione danno nemico',
          tier3: { title: '3B · Dissonanza Stridente', effect: 'Stagger continuo ogni 1.5s ai mob minori nell’area.', vfx: 'Cerchi d’urto violacei concentrici.', statuses: [sp('STUN', 0.4, 's/1.5s', 4)] },
          tier4: { title: '4B · Danno Nemico Red', effect: 'Riduce danno nemico nell’area dell’8% (4.0s).', vfx: 'Alone scuro desaturato sui mob.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Accecamento Zenitale', effect: 'Tiratori nemici: precisione -15% (4s).', vfx: 'Raggio dorato con particelle ascendenti.', statuses: [sp('SLOW', 15, '% acc', 4)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Stamina on Interrupt', effect: 'Ogni interrupt restituisce 10 Stamina a Jusef.', vfx: 'Scintilla dorata sul liuto.', statuses: [sp('REGEN', 10, 'stam', 1, 'self')] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: 'Bagliore Purificatore', effect: 'Purifica tutti i debuff DoT e Slow dal party.', vfx: 'Hit-Stop 3 frame, stella solare dorata.', statuses: [] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: 'Risacca Tossica', effect: 'SLOW -18% e blocco dash nell’area.', vfx: 'Pozza scura bordata d’arancio.', statuses: [sp('SLOW', 18, '%', 4), sp('ROOT', 1.5, 's dash', 4)] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Estensione Debuff', effect: 'Prolunga debuff danno nemico a 5.0s.', vfx: 'Bordi sfumati indaco scuro.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: 'Risacca Soffocante', effect: 'Al termine dei 4s implode per 15 danni da marea.', vfx: 'Hit-Stop 3 frame, onda d’urto scura piatta.', statuses: [] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Santuario Melodico (Difesa & Revive)',
          focus: 'Scudo 12–14 HP, Regen HP/Stamina e rianimazione rapida',
          tier3: { title: '3C · Rifugio Melodico', effect: 'SHIELD 12 HP (4s) e REGEN +15 stamina/s al party.', vfx: 'Cupola geometrica trasparente argentata.', statuses: [sp('SHIELD', 12, 'HP', 4, 'party'), sp('REGEN', 15, 'stam/s', 4, 'party')] },
          tier4: { title: '4C · Difesa Balistica', effect: '-10% danni da proiettili e AoE dentro l’area.', vfx: 'Bordo argentato compatto sui compagni.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: 'Alba Protettiva', effect: 'Scudo sale a 14 HP + immunità slow per 3s.', vfx: 'Decal dorata con raggi zenitali unlit.', statuses: [sp('SHIELD', 14, 'HP', 4, 'party')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Ritorsione Dorata', effect: 'Scudo rotto infligge 8 danni radiosi all’attaccante.', vfx: 'Lampo dorato reattivo a terra.', statuses: [] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: "Bastione d'Oriente", effect: 'Compagni nell’area ottengono SUPER_ARMOR per 2.0s netti.', vfx: 'Hit-Stop 3 frame, colonna d’oro solida.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 2, 'party')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: 'Marea Ristruttrice', effect: 'Party rigenera 3 HP/s per 3.0s (9 HP totali).', vfx: 'Pozza indaco con bordo arancio crepuscolare.', statuses: [sp('REGEN', 3, 'HP/s', 3, 'party')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Stamina Regen +20', effect: 'Estende rigenerazione stamina a +20/sec.', vfx: 'Increspature marine lente a pavimento.', statuses: [sp('REGEN', 20, 'stam/s', 4, 'party')] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: "Pace d'Occidente", effect: 'Rianimazione compagni caduti nell’area al 50% del tempo normale.', vfx: 'Hit-Stop 3 frame, specchio d’acqua placido.', statuses: [] },
            ],
          },
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 3. VYNCENT
  // -------------------------------------------------------------------------
  {
    id: 'vyncent',
    code: 'VY',
    name: 'Vyncent, la Bestia di Kaza-Massel',
    short: 'Vyncent',
    title: 'Brawler Ferino · Sustained Duellist',
    role: 'Umano Licantropo • Duello Stretto & Lifesteal',
    archetype: 'brawler',
    home: 'Kaza-Massel',
    color: '#ef4444',
    hp: 135,
    stamina: 110,
    speed: 7.3,
    critBase: 16,
    weaponStyle: 'Artigli & morsi ravvicinati (cono 1.8–2.0m) · Lifesteal nativo 10%',
    passiveExpansion: {
      innatePassive: 'Sete Ferina: il 10% di tutti i danni fisici inflitti viene convertito in HP (15% in Forma Licantropa).',
      passiveBranchName: 'Passiva · Sangue della Luna Scarlatta',
      passiveTiers: [
        { tier: 1, name: 'Frenesia dell’Artiglio I', effect: '+4% velocità d’attacco sui colpi leggeri consecutivi.', gemCost: 45 },
        { tier: 2, name: 'Caccia al Sangue II', effect: '+8% Move Speed verso bersagli affetti da DOT o sotto il 50% HP.', gemCost: 90 },
        { tier: 3, name: 'Tenacia Ferina III', effect: 'Il Lifesteal in eccesso a HP pieni genera fino a 6 HP di SHIELD.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Ululato del Branco Solitario',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Vyncent',
        gemCost: 220,
        effect: 'Durante Forma Licantropa [R], concatenare Balzo Ferino [E] riduce il cooldown di [E] del 40% e innesca Self-Resonance automatica se il bersaglio porta un Vento eterologo.',
        synergyTag: 'Loop Bruiser continuo su Boss & Sustain indipendente',
      },
    },
    specialE: {
      slot: 'E',
      name: 'Balzo Ferino',
      resource: 'Stamina',
      resourceCost: 22,
      cooldownSec: 7.5,
      baseSummary: 'Balzo a terra 5m con cono artigliata stretto (60°): 22 danni fisici + Lifesteal 10%.',
      tier1: { title: 'T1 · Balzo Base', effect: 'Danno 22, portata 5m, Lifesteal 10% (2.2 HP).', vfx: 'Traiettoria ad arco rosso cupo a terra.' },
      tier2: { title: 'T2 · Flessione Ferina', effect: 'Costo ridotto a 19 Stamina; +2 danno piatto (24).', vfx: 'Scie d’artiglio rosso sangue parallele.' },
      branches: [
        {
          branch: 'A',
          name: 'Squarcio del Predatore (Single & Bleed)',
          focus: 'Sanguinamento e sostentamento contro Boss',
          tier3: { title: '3A · Artigli Affondati', effect: '28 danni + DOT emorragico 2 dmg/s (3s).', vfx: 'Tre graffi rossi profondi a terra.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
          tier4: { title: '4A · Lifesteal Boss 15%', effect: 'Contro Élite o Boss, Lifesteal sale al 15%.', vfx: 'Micro-filamenti rossi verso Vyncent.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: 'Zanne di Fuoco', effect: 'DoT sale a 4 dmg/s per 3s.', vfx: 'Scia arancio-fuoco #D94E1F + brace.', statuses: [sp('DOT', 4, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Danno su DoT +6%', effect: 'Attacchi base su target con DoT: +6% EMPOWER.', vfx: 'Artigli con punte incandescenti.', statuses: [sp('EMPOWER', 6, '%', 3, 'self')] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: "Squarcio d'Africo", effect: 'Sotto 25% HP: +10 danni fisici e cura 8 HP netti.', vfx: 'Hit-Stop 3 frame, faglia rossa fiammeggiante.', statuses: [sp('REGEN', 8, 'HP', 1, 'self')] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Morsa Glaciale', effect: 'SLOW -12% (2.5s) e -6% atk speed.', vfx: 'Schegge ghiaccio opache #A8DADC.', statuses: [sp('SLOW', 12, '%', 2.5)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Armor Crack Boss', effect: 'Riduce armatura del Boss del 6%.', vfx: 'Bordo brinato sul modello nemico.', statuses: [sp('VULNERABLE', 6, '% armor', 3)] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Presa del Nord', effect: 'Se bersaglio è stordito, estende Stun di +0.5s.', vfx: 'Hit-Stop 3 frame, prisma azzurro piatto.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Sferzata Cinetica', effect: 'Respinge i mob adiacenti di 1.5m isolando il target.', vfx: 'Anello d’aria perlacea compressa.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Haste Personale', effect: 'HASTE +8% move speed per 2s dopo l’atterraggio.', vfx: 'Micro-folate attorno alle zampe.', statuses: [sp('HASTE', 8, '%', 2, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Ciclone Ferino', effect: 'Atterra il bersaglio principale sul posto per 1.0s.', vfx: 'Hit-Stop 3 frame, anello d’aria compressa.', statuses: [sp('STUN', 1.0, 's', 1.0)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Balzo a Valanga (Controllo Ingaggio)',
          focus: 'Onda sismica 3m e apertura sciami',
          tier3: { title: '3B · Onda d’Impatto', effect: 'Raggio 3m: 18 danni + Stagger leggero.', vfx: 'Decal circolare rossa con crepe concentriche.', statuses: [sp('STUN', 0.4, 's', 0.4)] },
          tier4: { title: '4B · Slow d’Urto', effect: 'Riduce velocità di movimento del 10% (2s).', vfx: 'Polvere sollevata a pavimento.', statuses: [sp('SLOW', 10, '%', 2)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Polvere di Calce', effect: 'DoT 2 dmg/s (3s) a tutti i mob nell’area.', vfx: 'Nube aranciata bassa con calce.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'HP on Multi-Hit', effect: '+2 HP per mob colpito (max +6 HP).', vfx: 'Lampi rossi sul modello.', statuses: [sp('REGEN', 6, 'HP', 1, 'self')] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Calpestio di Badiscar', effect: 'Demolisce guardie dei mob con scudo spezzando la parata.', vfx: 'Hit-Stop 3 frame, crepa magmatica.', statuses: [sp('VULNERABLE', 8, '%', 3)] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Lastra Glaciale', effect: 'Impedisce il dash ai mob per 1.5s.', vfx: 'Lastra di brina trasparente.', statuses: [sp('ROOT', 1.5, 's dash', 1.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Stagger Area +15%', effect: 'Aumenta danno da postura inflitto dall’onda (+15%).', vfx: 'Fratture di ghiaccio secche.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: 'Congelamento del Branco', effect: 'Mob minori nell’area subiscono Freeze (ROOT) 1.2s.', vfx: 'Hit-Stop 3 frame, lastra carsica piatta.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: "Turbine d'Impatto", effect: 'Attira leggermente i mob verso Vyncent di 1.0m.', vfx: 'Linee UV elicoidali perlacee.', statuses: [sp('DISPLACE', 1, 'm pull', 0.3)] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Stamina Heavy Red', effect: '-20% stamina sul successivo attacco pesante.', vfx: 'Bordo ventoso sulle braccia.', statuses: [sp('HASTE', 20, '% heavy', 2, 'self')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: 'Ruggito della Burrasca', effect: 'Interrompe i telegraph leggeri di tutti i mob nell’area.', vfx: 'Hit-Stop 3 frame, onda d’urto d’aria.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Istinto di Branco (Sustain & Armor)',
          focus: 'Scudo personale, Super-Armor e resistenza ravvicinata',
          tier3: { title: '3C · Corazza Ferina', effect: 'SHIELD 8 HP (3.5s) e SUPER_ARMOR per 1.5s.', vfx: 'Decal rossa scura + Rim-Light cremisi.', statuses: [sp('SHIELD', 8, 'HP', 3.5, 'self'), sp('SUPER_ARMOR', 1, 'flag', 1.5, 'self')] },
          tier4: { title: '4C · Lifesteal in Scudo', effect: 'Con scudo attivo, Lifesteal sale al 12%.', vfx: 'Occhi del licantropo brillano di rosso.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Ritorsione Termica', effect: 'Chi colpisce lo scudo in mischia subisce 3 danni.', vfx: 'Scintille arancioni reattive.', statuses: [] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Stamina on Broken', effect: 'Se lo scudo si rompe, recupera +15 Stamina.', vfx: 'Flash arancione sul petto.', statuses: [sp('REGEN', 15, 'stam', 1, 'self')] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: 'Cuore di Favonio Ferino', effect: 'Con scudo attivo: +8% EMPOWER da tutte le fonti.', vfx: 'Hit-Stop 3 frame, sigillo calce bruciata.', statuses: [sp('EMPOWER', 8, '%', 3.5, 'self')] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: "Soffio d'Inverno", effect: 'Alla scadenza scudo: SLOW -10% (2s) entro 2m.', vfx: 'Sbuffo vapore azzurro a terra.', statuses: [sp('SLOW', 10, '%', 2)] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Scudo Potenziato', effect: 'Scudo sale a 10 HP.', vfx: 'Bordo ghiacciato compatto.', statuses: [sp('SHIELD', 10, 'HP', 3.5, 'self')] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: 'Corazza del Lupo Invernale', effect: 'Scudo riduce del 15% i danni da proiettili.', vfx: 'Hit-Stop 3 frame, guscio di brina.', statuses: [] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Scatto Ferino', effect: 'Con scudo attivo: HASTE +8% move speed.', vfx: 'Scie d’aria bianca attorno ai piedi.', statuses: [sp('HASTE', 8, '%', 3.5, 'self')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Dash Cost Red', effect: 'Costo dash durante scudo ridotto del 20%.', vfx: 'Turbinio d’aria sui calzari.', statuses: [sp('HASTE', 20, '% dash', 3.5, 'self')] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Inarrestabile', effect: 'Immunità a rallentamenti e radicamenti per 3.0s netti.', vfx: 'Hit-Stop 3 frame, rosa dei venti d’aria.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 3, 'self')] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: 'Forma Licantropa',
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 65.0,
      baseSummary: 'Trasformazione 6.0s: +10% danno base, Lifesteal 15%, +10% Move Speed.',
      tier1: { title: 'T1 · Forma Base', effect: '+10% danno, Lifesteal 15%, +10% speed per 6.0s.', vfx: 'Bordo rosso sangue sul modello.' },
      tier2: { title: 'T2 · Sangue Rinvigorito', effect: '-10% startup; +2 danno per colpo.', vfx: 'Scia artigli più densa.' },
      branches: [
        {
          branch: 'A',
          name: 'Lupo Alfa (Duellante Implacabile)',
          focus: 'Ramp-up continuo sullo stesso bersaglio',
          tier3: { title: '3A · Caccia Fissa', effect: 'Colpi consecutivi sullo stesso target +3% fino a +12%.', vfx: 'Bordo emissivo rosso sangue.', statuses: [sp('EMPOWER', 12, '% max', 6, 'self')] },
          tier4: { title: '4A · Estensione Critica', effect: 'Critici prolungano forma di +0.5s (max +2s).', vfx: 'Artigli con scia persistente.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: "Artigli d'Alba", effect: 'Applica VULNERABLE +10% (3.0s) al Boss.', vfx: 'Decal dorata #FFD166 + Rim-Light oro.', statuses: [sp('VULNERABLE', 10, '%', 3)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Lifesteal 18%', effect: 'Lifesteal nella luce sale al 18%.', vfx: 'Scintille dorate verso il petto.', statuses: [] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: 'Fauci del Sole Nascente', effect: 'Boss in Break: morso finale +12 danni e cura 10 HP.', vfx: 'Hit-Stop 3 frame, colonna dorata zenitale.', statuses: [sp('REGEN', 10, 'HP', 1, 'self')] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: 'Lupo del Crepuscolo', effect: 'Micro-risacca: pull mob + DOT emorragico 3 dmg/s.', vfx: 'Decal indaco/cremisi #9A031E + Rim-Light.', statuses: [sp('DISPLACE', 1.5, 'm pull', 0.3), sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stealth in Pozza', effect: 'Mob colpiti perdono il puntamento (STEALTH_CAMO 1.5s).', vfx: 'Silhouette d’ombra verso est.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 1.5, 'self')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: 'Voragine dello Jonio', effect: 'A fine forma risacca implode atterrando mob minori 1.2s.', vfx: 'Hit-Stop 3 frame, pozza marea scura.', statuses: [sp('STUN', 1.2, 's', 1.2)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Furia Selvaggia (Rottura Gruppo)',
          focus: 'Ruggito 360° all’attivazione + danno postura Boss',
          tier3: { title: '3B · Ruggito d’Apertura', effect: 'Ruggito 5m: 20 danni e Stagger a tutti i mob.', vfx: 'Decal circolare rossa d’urto.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
          tier4: { title: '4B · Armor Crack Ruggito', effect: 'Riduce armatura mob colpiti del 6% (3.0s).', vfx: 'Crepe rosse sul terreno.', statuses: [sp('VULNERABLE', 6, '% armor', 3)] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Bagliore del Lupo', effect: 'Tiratori nemici: precisione -15% (3s).', vfx: 'Onda dorata circolare piatta.', statuses: [sp('SLOW', 15, '% acc', 3)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Super-Armor Avvio', effect: 'SUPER_ARMOR per i primi 2.5s.', vfx: 'Contorno dorato solido.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 2.5, 'self')] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: 'Bagliore del Branco', effect: 'Compagni entro 6m: EMPOWER +6% (3.0s).', vfx: 'Hit-Stop 3 frame, stella solare d’oro.', statuses: [sp('EMPOWER', 6, '%', 3, 'party')] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: 'Risacca del Ruggito', effect: 'Pozza rallenta nemici -12% (3s).', vfx: 'Pozza scura bordata d’arancio.', statuses: [sp('SLOW', 12, '%', 3)] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Stamina Avvio', effect: 'Ripristina 15 Stamina all’attivazione.', vfx: 'Scie d’acqua verso i piedi.', statuses: [sp('REGEN', 15, 'stam', 1, 'self')] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: 'Risacca Vorace', effect: 'Ruggito infligge +25 punti danno postura al Boss.', vfx: 'Hit-Stop 3 frame, distorsione crepuscolare.', statuses: [] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Sopravvivenza Bestiale (Rigenerazione)',
          focus: 'Scudo 12–15 HP, Regen e protezione anti-morte',
          tier3: { title: '3C · Pelle d’Acciaio', effect: 'SHIELD 12 HP (5.0s) + REGEN 2 HP/s (3s).', vfx: 'Guscio rosso trasparente + Rim-Light.', statuses: [sp('SHIELD', 12, 'HP', 5, 'self'), sp('REGEN', 2, 'HP/s', 3, 'self')] },
          tier4: { title: '4C · Resistenza Passiva', effect: '-10% danni da tutte le fonti con scudo attivo.', vfx: 'Bordo armatura naturale rinforzato.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: 'Rigenerazione Solare', effect: 'Scudo sale a 14 HP e purifica tutti i DoT.', vfx: 'Decal dorata + raggio unlit.', statuses: [sp('SHIELD', 14, 'HP', 5, 'self')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Ritorsione Luce', effect: 'Scudo colpito riflette 6 danni.', vfx: 'Lampo dorato a terra.', statuses: [] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: "Invulnerabilità dell'Alba", effect: 'Non può scendere sotto 1 HP per i primi 2.0s.', vfx: 'Hit-Stop 3 frame, pilastro d’oro.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 2, 'self')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: 'Marea Vitale', effect: 'Rigenerazione sale a 3 HP/s per 3s (9 HP).', vfx: 'Decal indaco con riflessi arancio.', statuses: [sp('REGEN', 3, 'HP/s', 3, 'self')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Stamina Regen +15', effect: 'Ripristina anche +15 stamina/s.', vfx: 'Increspature calme a pavimento.', statuses: [sp('REGEN', 15, 'stam/s', 3, 'self')] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: "Ristoro del Mare d'Ossidiana", effect: 'Su colpo letale in forma: scudo rigenerato a 15 HP (1/sessione).', vfx: 'Hit-Stop 3 frame, specchio d’acqua scuro.', statuses: [sp('SHIELD', 15, 'HP', 5, 'self')] },
            ],
          },
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 4. ALEXIOS
  // -------------------------------------------------------------------------
  {
    id: 'alexios',
    code: 'AX',
    name: 'Alexios, il Golem del Bastione',
    short: 'Alexios',
    title: 'Juggernaut · Main Tank & Baluardo',
    role: 'Golem di Pietra Vivente • Controllo Sismico & Scudi Party',
    archetype: 'juggernaut',
    home: 'Badiscar',
    color: '#64748b',
    hp: 220,
    stamina: 100,
    speed: 6.2,
    critBase: 10,
    weaponStyle: 'Pugni di roccia viva · HP max del roster (220 HP), barriere fisiche & Taunt',
    passiveExpansion: {
      innatePassive: 'Massa Litica: riduce il contraccolpo subito del 50%; parate perfette generano onda d’urto 2m.',
      passiveBranchName: 'Passiva · Fondamenta di Granito',
      passiveTiers: [
        { tier: 1, name: 'Scorza Calcarea I', effect: '+15 HP massimi base e +10% efficacia degli scudi su sé stesso.', gemCost: 45 },
        { tier: 2, name: 'Passo Tellurico II', effect: 'Immunità alla riduzione velocità di Quota -1 (-15% ignorato).', gemCost: 90 },
        { tier: 3, name: 'Ancora del Party III', effect: 'Gli alleati entro 4m da Alexios subiscono -6% danno da attacchi ad area.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Patto dei Quattro Pilastri',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Alexios',
        gemCost: 220,
        effect: 'Mentre Alexios ha SUPER_ARMOR attivo, assorbe il 20% dei danni da Anti-Zerg dei compagni entro 6m e li converte in Carica Postura sul prossimo Pestone Sismico [E].',
        synergyTag: 'Mitigazione diretta Anti-Zerg per raid da 6–9 giocatori',
      },
    },
    specialE: {
      slot: 'E',
      name: 'Pestone Sismico',
      resource: 'Stamina',
      resourceCost: 25,
      cooldownSec: 8.5,
      baseSummary: 'Schianta il pugno a terra: onda circolare 4m, 20 danni fisici e Stagger mob minori.',
      tier1: { title: 'T1 · Pestone Base', effect: 'Danno 20, raggio 4.0m, Stagger mob minori.', vfx: 'Frattura concentrica grigio calcare.' },
      tier2: { title: 'T2 · Impatto Litico', effect: 'Cooldown ridotto a 7.6s; +2 danno piatto (22).', vfx: 'Debris di roccia calcarea a pavimento.' },
      branches: [
        {
          branch: 'A',
          name: 'Spacco Litico (Anti-Boss & Stun)',
          focus: 'Danno singolo concentrato e barra postura Boss',
          tier3: { title: '3A · Spacco Concentrato', effect: '28 danni singoli + STUN 0.8s (0.4s Boss).', vfx: 'Spacco rettilineo profondo.', statuses: [sp('STUN', 0.8, 's', 0.8)] },
          tier4: { title: '4A · Postura Boss -20', effect: 'Rimuove 20 punti extra dalla Barra Postura Boss.', vfx: 'Scintille secche litiche.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: "Pestone d'Africo", effect: 'DOT da calore 3 dmg/s (3s).', vfx: 'Fessura arancio-fuoco #D94E1F + calce.', statuses: [sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Armor Crack Boss', effect: 'Riduce armatura del Boss del 6% (3s).', vfx: 'Bagliore arancione pulsante.', statuses: [sp('VULNERABLE', 6, '% armor', 3)] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: 'Cratere di Calce Viva', effect: 'Sotto 25% HP: +10 danni + onda secondaria 8 danni.', vfx: 'Hit-Stop 3 frame, cratere calce bruciata.', statuses: [] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Spacco di Cava Carsica', effect: 'Riduce velocità d’attacco del Boss dell’8% (3s).', vfx: 'Dente di ghiaccio azzurro opaco.', statuses: [sp('SLOW', 8, '% atk', 3)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Freeze CD Boss', effect: 'Se stordito, congela i cooldown del Boss per 1.0s.', vfx: 'Bordo brinato sul modello del Boss.', statuses: [] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Frantumazione del Nord', effect: 'Applica VULNERABLE +10% al Boss per 3.0s.', vfx: 'Hit-Stop 3 frame, blocco calcare ghiacciato.', statuses: [sp('VULNERABLE', 10, '%', 3)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Fendente Cinetico', effect: 'Lama d’aria spinge il bersaglio di 1.5m.', vfx: 'Getto d’aria perlaceo a pavimento.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Haste Golem', effect: 'HASTE +6% move speed (2s) dopo l’impatto.', vfx: 'Turbinio attorno alle gambe di roccia.', statuses: [sp('HASTE', 6, '%', 2, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Ciclone Terrestre', effect: 'Risucchia mob minori verso l’impatto di 1.5m compattandoli.', vfx: 'Hit-Stop 3 frame, rosa dei venti d’aria.', statuses: [sp('DISPLACE', 1.5, 'm pull', 0.3)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Faglia Carsica (Controllo Spaziale)',
          focus: 'Zona detriti 5m, blocco dash e deviazione proiettili',
          tier3: { title: '3B · Detriti Calcarei', effect: 'Zona 5m (3.5s): SLOW -12% e 2 dmg/s.', vfx: 'Decal circolare grigia con ciottoli.', statuses: [sp('SLOW', 12, '%', 3.5), sp('DOT', 2, 'dmg/s', 3.5)] },
          tier4: { title: '4B · Blocco Dash Faglia', effect: 'Mob dentro la faglia non possono dashare.', vfx: 'Detriti calcarei con contorno marcato.', statuses: [sp('ROOT', 1.5, 's dash', 3.5)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Calce Bruciante', effect: 'DOT sale a 3 dmg/s (3.5s).', vfx: 'Decal aranciata calda con fumo basso.', statuses: [sp('DOT', 3, 'dmg/s', 3.5)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'Precisione Nemica Red', effect: 'Precisione dei nemici nella calce -10%.', vfx: 'Nube polvere opaca < 0.8m.', statuses: [sp('SLOW', 10, '% acc', 3.5)] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Calderone Salentino', effect: 'A fine faglia la calce esplode: 12 danni + Stagger.', vfx: 'Hit-Stop 3 frame, sfogo arancione piatto.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Lastra Glaciale', effect: 'SLOW -15% e +10% danno postura sui mob.', vfx: 'Lastra brina azzurro-bianca.', statuses: [sp('SLOW', 15, '%', 3.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Durata Faglia 4.0s', effect: 'Estende la durata della lastra a 4.0s.', vfx: 'Cristalli di sale ai bordi decal.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: 'Congelamento Litico', effect: 'Mob fermi nella faglia >2s: ROOT 1.2s.', vfx: 'Hit-Stop 3 frame, mandala ghiaccio carsico.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: 'Muro di Vento', effect: 'Devia proiettili nemici leggeri attraverso l’area.', vfx: 'Linee d’aria orizzontali scorrevoli.', statuses: [] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Haste su Faglia', effect: 'Alleati nella faglia: HASTE +6% move speed.', vfx: 'Micro-scie perlacee sui calzari.', statuses: [sp('HASTE', 6, '%', 2, 'party')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: 'Occhio del Maestrale', effect: 'Deflette il primo telegraph a proiettile pesante di un Mini-Boss.', vfx: 'Hit-Stop 3 frame, cerchio d’aria compresso.', statuses: [] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Baluardo Vivente (Taunt & Scudi)',
          focus: 'Taunt rigido 6m, scudi di squadra e reindirizzamento danni',
          tier3: { title: '3C · Urlo di Pietra', effect: 'Taunt 3.0s entro 6m + SHIELD 12 HP (4s) su Alexios.', vfx: 'Cerchio runico terroso + Rim-Light pietra.', statuses: [sp('SHIELD', 12, 'HP', 4, 'self')] },
          tier4: { title: '4C · Resistenza in Scudo', effect: '-10% danno subito con scudo attivo.', vfx: 'Texture rocciosa più opaca e dura.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Ritorsione Termica', effect: 'Mob in mischia subiscono 3 danni contro scudo.', vfx: 'Scintille arancioni sull’armatura.', statuses: [] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Empower on Decay', effect: 'Alla scadenza scudo: +6% EMPOWER al party (2s).', vfx: 'Onda arancione a terra.', statuses: [sp('EMPOWER', 6, '%', 2, 'party')] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: 'Favonio del Golem', effect: 'Con scudo attivo: party entro 6m spende -15% stamina.', vfx: 'Hit-Stop 3 frame, fiamma di calce incisa.', statuses: [sp('HASTE', 15, '% stam', 4, 'party')] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: 'Egida di Brina', effect: 'SHIELD 8 HP (3.5s) a tutto il party entro 8m.', vfx: 'Bordo azzurro compatto sui compagni.', statuses: [sp('SHIELD', 8, 'HP', 3.5, 'party')] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Immunità Slow Party', effect: 'Scudi Tramontana rendono immuni a Slow per 2.5s.', vfx: 'Brina sui bordi dello scudo.', statuses: [] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: 'Egida del Grecale', effect: 'Scudo party sale a 12 HP; se rotto applica Stagger.', vfx: 'Hit-Stop 3 frame, guscio brina compatto.', statuses: [sp('SHIELD', 12, 'HP', 3.5, 'party')] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Aura di Vento', effect: 'HASTE +6% move speed al party (3.0s).', vfx: 'Scie d’aria bianca sotto i piedi.', statuses: [sp('HASTE', 6, '%', 3, 'party')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Dash Cost Party Red', effect: '-15% costo dash dentro l’aura.', vfx: 'Micro-nastri d’aria sui piedi alleati.', statuses: [sp('HASTE', 15, '% dash', 3, 'party')] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Raffica Protettiva', effect: 'Alexios devia su di sé il 10% dei danni subiti dal party entro 6m.', vfx: 'Hit-Stop 3 frame, rosa dei venti protettiva.', statuses: [] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: 'Monolite del Bastione',
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 65.0,
      baseSummary: 'Radicato al suolo per 5.0s: 3 onde sismiche (6m, 18 danni ciascuna) + SUPER_ARMOR.',
      tier1: { title: 'T1 · Monolite Base', effect: '3 onde da 18 danni (raggio 6m) + SUPER_ARMOR 5.0s.', vfx: 'Onde di roccia concentriche.' },
      tier2: { title: 'T2 · Ancoraggio Tellurico', effect: '-10% startup; +2 danno per onda.', vfx: 'Polvere litica più fitta.' },
      branches: [
        {
          branch: 'A',
          name: 'Frantumazione Monolitica (Anti-Guardia)',
          focus: 'Stagger -25 postura Boss + esposizione vulnerabilità',
          tier3: { title: '3A · Riduzione Armatura', effect: '-8% armatura (5s) + -25 postura Boss.', vfx: 'Spacchi radiali profondi.', statuses: [sp('VULNERABLE', 8, '% armor', 5)] },
          tier4: { title: '4A · Stun Terza Onda', effect: 'Colpiti da 3 onde: STUN 1.0s (0.5s Boss).', vfx: 'Crepe brillanti di bianco alla 3a onda.', statuses: [sp('STUN', 1.0, 's', 1.0)] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: 'Monolite Solare', effect: 'Colonna dorata 6m: VULNERABLE +10% (4.0s).', vfx: 'Decal dorata #FFD166 + raggio unlit.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Crit in Luce', effect: 'Party nella luce: +6% Crit Rate.', vfx: 'Raggi dorati lineari a terra.', statuses: [sp('EMPOWER', 6, '% crit', 4, 'party')] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: "L'Alba del Colosso", effect: 'Boss in Break: ultima onda +12 danni e +1.5s Break.', vfx: 'Hit-Stop 3 frame, colonna d’oro solida.', statuses: [] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: 'Maelstrom Litico', effect: 'Pull 2m + DOT 3 dmg/s (4s).', vfx: 'Decal indaco/cremisi #9A031E.', statuses: [sp('DISPLACE', 2, 'm pull', 0.4), sp('DOT', 3, 'dmg/s', 4)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stealth Distanza', effect: 'Mob nella risacca perdono mira sugli alleati ranged.', vfx: 'Ombre estese verso est.', statuses: [sp('STEALTH_CAMO', 1, 'flag', 2, 'party')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: 'Abisso dello Jonio', effect: 'Ultima onda atterra sul posto mob minori per 1.2s.', vfx: 'Hit-Stop 3 frame, specchio d’acqua scura.', statuses: [sp('STUN', 1.2, 's', 1.2)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Fortezza Inviolabile (Coperture)',
          focus: 'Alza blocchi di roccia anti-proiettile a Quota 0/+1',
          tier3: { title: '3B · Barriera Calcarea', effect: 'Faglia di roccia blocca proiettili a Quota 0/+1 (4.0s).', vfx: 'Blocchi geometrici < 1.2m a pavimento.', statuses: [] },
          tier4: { title: '4B · Stagger Blocchi', effect: 'Nemici a contatto con i blocchi subiscono Stagger continuo.', vfx: 'Polvere di pietra alla base.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Bagliore Blocchi', effect: 'Tiratori nemici: -15% precisione (4s).', vfx: 'Emissione oro dai blocchi.', statuses: [sp('SLOW', 15, '% acc', 4)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Danno Ranged Party', effect: 'Alleati dietro i blocchi: +6% EMPOWER a distanza.', vfx: 'Bordo oro sulle armi tiratori.', statuses: [sp('EMPOWER', 6, '% ranged', 4, 'party')] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: "Baluardo d'Otranto", effect: 'Blocchi assorbono fino a 80 danni da proiettile.', vfx: 'Hit-Stop 3 frame, stella solare a terra.', statuses: [] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: 'Risacca Blocchi', effect: 'Pozza attorno ai blocchi: SLOW -15%.', vfx: 'Pozza crepuscolare tra le rocce.', statuses: [sp('SLOW', 15, '%', 4)] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Stamina in Pozza', effect: 'Party rigenera +10 stamina/s nell’area.', vfx: 'Increspature marine a pavimento.', statuses: [sp('REGEN', 10, 'stam/s', 4, 'party')] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: 'Ossidiana Vivente', effect: 'Al collasso blocchi esplodono: 15 danni fisici entro 4m.', vfx: 'Hit-Stop 3 frame, onda d’urto scura.', statuses: [] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Sacrificio della Pietra (Protezione)',
          focus: 'Scudo 14–15 HP, condivisione danno e salvataggio a 1 HP',
          tier3: { title: '3C · Estensione di Massa', effect: 'SHIELD 14 HP (5.0s) a tutto il party entro 8m.', vfx: 'Cupola runica terrosa connessa.', statuses: [sp('SHIELD', 14, 'HP', 5, 'party')] },
          tier4: { title: '4C · Danno Condiviso 15%', effect: '15% del danno subito dai compagni trasferito ad Alexios.', vfx: 'Linee energetiche terrose verso Alexios.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: "Egida d'Oro", effect: 'Scudo sale a 15 HP e purifica i debuff slow.', vfx: 'Decal dorata + raggi zenitali.', statuses: [sp('SHIELD', 15, 'HP', 5, 'party')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Stun Reattivo', effect: 'Scudo rotto stordisce l’attaccante per 0.5s.', vfx: 'Lampo dorato reattivo.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: 'Cuore Infrangibile', effect: 'Alexios e party ottengono SUPER_ARMOR per tutta la durata.', vfx: 'Hit-Stop 3 frame, pilastro d’oro solido.', statuses: [sp('SUPER_ARMOR', 1, 'flag', 5, 'party')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: 'Marea del Riposo', effect: 'Compagni protetti rigenerano 2 HP/s (6 HP totali).', vfx: 'Decal indaco con riflessi arancio.', statuses: [sp('REGEN', 2, 'HP/s', 3, 'party')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Stamina Regen +15', effect: '+15 stamina/s ai compagni protetti.', vfx: 'Increspature calme a pavimento.', statuses: [sp('REGEN', 15, 'stam/s', 3, 'party')] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: 'Risacca della Salvezza', effect: 'Su colpo letale al compagno: resta a 1 HP + 1.0s i-frame.', vfx: 'Hit-Stop 3 frame, specchio d’acqua calmo.', statuses: [] },
            ],
          },
        },
      ],
    },
  },

  // -------------------------------------------------------------------------
  // 5. RYCARD
  // -------------------------------------------------------------------------
  {
    id: 'rycard',
    code: 'RY',
    name: 'Rycard, il Reietto della Cengia',
    short: 'Rycard',
    title: 'Cecchino Ranged · Dominio Quota +1',
    role: 'Nobile Elfo Reietto • DPS Distanza Critica',
    archetype: 'sniper',
    home: 'Costa Est',
    color: '#22c55e',
    hp: 90,
    stamina: 115,
    speed: 7.5,
    critBase: 30,
    weaponStyle: 'Arco lungo d’avanguardia · Crit 30% + bonus Quota +1/+2 (High-Ground)',
    passiveExpansion: {
      innatePassive: 'Occhio d’Altezza: +10% danno e +2m gittata quando spara da Quota +1 verso quote 0 o -1.',
      passiveBranchName: 'Passiva · Balistica delle Scogliere',
      passiveTiers: [
        { tier: 1, name: 'Distanza Critica I', effect: 'Soglia della Distanza Critica (+15% Crit) ridotta da 6.0m a 5.0m.', gemCost: 45 },
        { tier: 2, name: 'Vento in Coda II', effect: 'Uccidere o colpire criticamente da Quota +1 conferisce +6% Move Speed (2s).', gemCost: 90 },
        { tier: 3, name: 'Punta d’Ossa III', effect: 'I colpi pesanti caricati ignorano il 15% dello scudo frontale delle Guardie Scudate.', gemCost: 135 },
      ],
      uniqueKeystone: {
        name: 'Firma Unica · Freccia del Zenit Alto',
        unlockRequirement: 'Almeno 3 Tier sbloccati su Rycard',
        gemCost: 220,
        effect: 'Quando Rycard spara Tiro Mirato [E] da Quota +1, l’attacco applica sia l’effetto del Vento scelto su [E] che +15% danno bonus High-Ground invece del +10% standard.',
        synergyTag: 'Reward diretto per posizionamento sulle cenge +1 delle mappe 2.5D',
      },
    },
    specialE: {
      slot: 'E',
      name: 'Tiro Mirato',
      resource: 'Stamina',
      resourceCost: 18,
      cooldownSec: 6.5,
      baseSummary: 'Carica 0.8s, gittata 12m, 24 danni fisici; +15% Crit Rate oltre 6m (Distanza Critica).',
      tier1: { title: 'T1 · Tiro Base', effect: 'Danno 24, gittata 12m, +15% Crit oltre 6m.', vfx: 'Traiettoria sottile verde-salvia a terra.' },
      tier2: { title: 'T2 · Tensione Elfica', effect: 'Carica ridotta a 0.65s; +2 danno piatto (26).', vfx: 'Flash di tensione sull’arco.' },
      branches: [
        {
          branch: 'A',
          name: 'Dardo da Cecchino (Perforazione)',
          focus: 'Trapassa 2–4 nemici in linea + perforazione da Quota +1',
          tier3: { title: '3A · Dardo Perforante', effect: '32 danni al 1° target, 20 al 2° in linea.', vfx: 'Freccia con scia verde brillante.', statuses: [] },
          tier4: { title: '4A · Perforazione da Quota', effect: 'Da Quota +1/+2 verso Quota 0: ignora 8% armatura.', vfx: 'Bagliore geometrico sulla traiettoria.', statuses: [] },
          windRoutes: {
            SCIROCCO: [
              { id: '5A1', tier: 5, wind: 'SCIROCCO', title: 'Freccia di Favonio', effect: 'DOT calore 3 dmg/s (3s) al 1° target.', vfx: 'Scia arancio-fuoco #D94E1F + brace.', statuses: [sp('DOT', 3, 'dmg/s', 3)] },
              { id: '6A1', tier: 6, wind: 'SCIROCCO', title: 'Detonazione DoT', effect: 'Critico consuma DoT infliggendo +6 danni extra.', vfx: 'Esplosione arancione compatta.', statuses: [] },
              { id: '7A1', tier: 7, wind: 'SCIROCCO', title: "Perforatore d'Africo", effect: 'Sotto 25% HP: +10 danni + VULNERABLE +10% (3s).', vfx: 'Hit-Stop 3 frame, fessura calce bruciata.', statuses: [sp('VULNERABLE', 10, '%', 3)] },
            ],
            TRAMONTANA: [
              { id: '5A2', tier: 5, wind: 'TRAMONTANA', title: 'Dardo Invernale', effect: 'SLOW -12% (2.5s) e -6% atk speed.', vfx: 'Scia bianco-azzurra con aghi brina.', statuses: [sp('SLOW', 12, '%', 2.5)] },
              { id: '6A2', tier: 6, wind: 'TRAMONTANA', title: 'Slow Quota 3.5s', effect: 'Dura 3.5s se sparato da quota elevata (+1/+2).', vfx: 'Target ricoperto di ghiaccio opaco.', statuses: [sp('SLOW', 12, '%', 3.5)] },
              { id: '7A2', tier: 7, wind: 'TRAMONTANA', title: 'Dardo del Grecale', effect: 'Se già rallentato: ROOT 1.2s sul posto.', vfx: 'Hit-Stop 3 frame, prisma azzurro piatto.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5A3', tier: 5, wind: 'MAESTRALE', title: 'Tiro a Burrasca', effect: 'Spinge indietro i bersagli colpiti di 1.5m.', vfx: 'Tubo d’aria compressa perlaceo.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6A3', tier: 6, wind: 'MAESTRALE', title: 'Haste Riposizionamento', effect: 'HASTE +8% move speed (2s) dopo il tiro.', vfx: 'Scie d’aria sui piedi dell’elfo.', statuses: [sp('HASTE', 8, '%', 2, 'self')] },
              { id: '7A3', tier: 7, wind: 'MAESTRALE', title: 'Saetta del Canale', effect: 'Trapassa fino a 4 nemici e ostacoli leggeri Quota +1.', vfx: 'Hit-Stop 3 frame, fascio d’aria continuo.', statuses: [] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Dardo a Frammentazione (Area 3m)',
          focus: 'Esplosione schegge e apertura spazi di fuga',
          tier3: { title: '3B · Esplosione Schegge', effect: 'Area 3m: 18 danni + Stagger leggero.', vfx: 'Decal circolare con schegge metalliche.', statuses: [sp('STUN', 0.4, 's', 0.4)] },
          tier4: { title: '4B · Slow Schegge', effect: 'SLOW -10% (2s) a tutti i nemici colpiti.', vfx: 'Polvere sollevata all’impatto.', statuses: [sp('SLOW', 10, '%', 2)] },
          windRoutes: {
            SCIROCCO: [
              { id: '5B1', tier: 5, wind: 'SCIROCCO', title: 'Calce a Frammenti', effect: 'DOT 2 dmg/s (3s) nell’area.', vfx: 'Cerchio d’urto aranciato con brace.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6B1', tier: 6, wind: 'SCIROCCO', title: 'Stamina on Multi-Hit', effect: 'Colpendo >= 3 mob recupera +10 Stamina.', vfx: 'Lampo verde-arancio sull’arco.', statuses: [sp('REGEN', 10, 'stam', 1, 'self')] },
              { id: '7B1', tier: 7, wind: 'SCIROCCO', title: 'Salva di Calce Viva', effect: 'Riduce armatura dei mob colpiti dell’8% (3.0s).', vfx: 'Hit-Stop 3 frame, fiammata piatta.', statuses: [sp('VULNERABLE', 8, '% armor', 3)] },
            ],
            TRAMONTANA: [
              { id: '5B2', tier: 5, wind: 'TRAMONTANA', title: 'Lastra di Schegge', effect: 'Blocca dash nemici nell’area per 1.5s.', vfx: 'Lastra di brina trasparente.', statuses: [sp('ROOT', 1.5, 's dash', 1.5)] },
              { id: '6B2', tier: 6, wind: 'TRAMONTANA', title: 'Postura Mob +15%', effect: '+15% danno postura subito dai mob.', vfx: 'Cristalli di sale e ghiaccio.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'TRAMONTANA', title: 'Tempesta di Ghiaccio Carsico', effect: 'Mob minori nell’area: ROOT 1.2s.', vfx: 'Hit-Stop 3 frame, mandala brina.', statuses: [sp('ROOT', 1.2, 's', 1.2)] },
            ],
            MAESTRALE: [
              { id: '5B3', tier: 5, wind: 'MAESTRALE', title: 'Turbine Schegge', effect: 'Spinge via mob leggeri di 1.5m.', vfx: 'Anello d’aria perlaceo espanso.', statuses: [sp('DISPLACE', 1.5, 'm', 0.3)] },
              { id: '6B3', tier: 6, wind: 'MAESTRALE', title: 'Stamina Next Shot', effect: '-20% stamina sul successivo Tiro Mirato.', vfx: 'Vento compresso sulla corda.', statuses: [sp('HASTE', 20, '% next', 3, 'self')] },
              { id: '7B3', tier: 7, wind: 'MAESTRALE', title: 'Raffica Respinta', effect: 'Interrompe i canali di tutti i mob colpiti.', vfx: 'Hit-Stop 3 frame, onda d’urto d’aria.', statuses: [sp('STUN', 0.5, 's', 0.5)] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Tiro di Copertura (Segnalazione)',
          focus: 'Target priority +6–10% danno e Crit per il party',
          tier3: { title: '3C · Freccia Segnalatrice', effect: 'Party +6% danno vs target segnalato (4.0s).', vfx: 'Reticolo verde-oro sotto il bersaglio.', statuses: [sp('VULNERABLE', 6, '%', 4)] },
          tier4: { title: '4C · Crit Rate Party', effect: 'Compagni vs target segnalato: +8% Crit Rate.', vfx: 'Scintille verdi sui colpi party.', statuses: [sp('EMPOWER', 8, '% crit', 4, 'party')] },
          windRoutes: {
            SCIROCCO: [
              { id: '5C1', tier: 5, wind: 'SCIROCCO', title: 'Segnale Bruciante', effect: '2 dmg/s ai mob adiacenti al target.', vfx: 'Braci arancioni attorno al target.', statuses: [sp('DOT', 2, 'dmg/s', 3)] },
              { id: '6C1', tier: 6, wind: 'SCIROCCO', title: 'Reset Tiro on Kill', effect: 'Alla morte del target: prossimo Tiro Mirato gratuito (0 stam).', vfx: 'Arco brilla di verde chiaro.', statuses: [] },
              { id: '7C1', tier: 7, wind: 'SCIROCCO', title: "Bersaglio d'Africo", effect: 'Sotto 25% HP sale a VULNERABLE +10%.', vfx: 'Hit-Stop 3 frame, sigillo calce bruciata.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
            ],
            TRAMONTANA: [
              { id: '5C2', tier: 5, wind: 'TRAMONTANA', title: 'Segnale di Gelo', effect: 'Colpi sul target rimuovono +10% barra postura.', vfx: 'Schegge ghiaccio secche.', statuses: [] },
              { id: '6C2', tier: 6, wind: 'TRAMONTANA', title: 'Danno Boss Red', effect: 'Riduce danno inferto dal bersaglio dell’8%.', vfx: 'Alone azzurrino opaco sul Boss.', statuses: [] },
              { id: '7C2', tier: 7, wind: 'TRAMONTANA', title: 'Freddo di Vedetta', effect: 'Alla scadenza: STUN 0.8s (0.4s Boss).', vfx: 'Hit-Stop 3 frame, prisma azzurro.', statuses: [sp('STUN', 0.8, 's', 0.8)] },
            ],
            MAESTRALE: [
              { id: '5C3', tier: 5, wind: 'MAESTRALE', title: 'Segnale di Vento', effect: 'Compagno attaccante: HASTE +6% (2s).', vfx: 'Micro-scie vento sotto i piedi.', statuses: [sp('HASTE', 6, '%', 2, 'party')] },
              { id: '6C3', tier: 6, wind: 'MAESTRALE', title: 'Raggio Buff 8m', effect: 'Raggio del buff velocità sale a 8m.', vfx: 'Cerchio d’aria perlaceo espanso.', statuses: [] },
              { id: '7C3', tier: 7, wind: 'MAESTRALE', title: 'Orizzonte Aperto', effect: 'Uccisione target conferisce SHIELD 8 HP al party (3.0s).', vfx: 'Hit-Stop 3 frame, alone verde-argento.', statuses: [sp('SHIELD', 8, 'HP', 3, 'party')] },
            ],
          },
        },
      ],
    },
    ultimateR: {
      slot: 'R',
      name: 'Pioggia di Dardi',
      resource: 'Eclissi',
      resourceCost: 100,
      cooldownSec: 55.0,
      baseSummary: 'Salva a parabola (raggio 6m, gittata 14m, 3.5s): 22 danni fisici + SLOW -12%.',
      tier1: { title: 'T1 · Pioggia Base', effect: 'Area 6m (3.5s), 22 danni, SLOW -12%.', vfx: 'Frecce con scie verdi a pioggia.' },
      tier2: { title: 'T2 · Balistica Elfica', effect: '-10% ritardo caduta; +2 danno totale.', vfx: 'Salva più fitta e nitida.' },
      branches: [
        {
          branch: 'A',
          name: 'Salva Concentrata (Anti-Boss)',
          focus: 'Raggio stretto 4.5m, 30 danni e -25 postura Boss',
          tier3: { title: '3A · Raggio Stretto 4.5m', effect: 'Area 4.5m: 30 danni concentrati.', vfx: 'Frecce fitte parallele.', statuses: [] },
          tier4: { title: '4A · Postura Boss -25', effect: 'Se Boss resta >=2s: rimuove 25 punti postura.', vfx: 'Impatti metallici con schegge verdi.', statuses: [] },
          windRoutes: {
            LEVANTE: [
              { id: '5A1', tier: 5, wind: 'LEVANTE', title: 'Salva del Sole Nascente', effect: 'Colonna dorata 6m: VULNERABLE +10% (4.0s).', vfx: 'Decal dorata #FFD166 + raggio unlit.', statuses: [sp('VULNERABLE', 10, '%', 4)] },
              { id: '6A1', tier: 6, wind: 'LEVANTE', title: 'Crit in Luce', effect: '+8% Crit Rate dentro la luce.', vfx: 'Frecce color oro brillante.', statuses: [sp('EMPOWER', 8, '% crit', 4, 'self')] },
              { id: '7A1', tier: 7, wind: 'LEVANTE', title: "Saetta d'Oriente", effect: 'Boss in Break: +10 danni e +1.5s Break.', vfx: 'Hit-Stop 3 frame, fascio zenitale dorato.', statuses: [] },
            ],
            PONENTE: [
              { id: '5A2', tier: 5, wind: 'PONENTE', title: 'Pioggia della Risacca', effect: 'Pozza 6m: pull 2m + DOT 3 dmg/s (4s).', vfx: 'Decal indaco/cremisi #9A031E.', statuses: [sp('DISPLACE', 2, 'm pull', 0.4), sp('DOT', 3, 'dmg/s', 4)] },
              { id: '6A2', tier: 6, wind: 'PONENTE', title: 'Stamina in Pozza', effect: '+12 stamina/s nella pozza.', vfx: 'Increspature d’acqua calme.', statuses: [sp('REGEN', 12, 'stam/s', 4, 'self')] },
              { id: '7A2', tier: 7, wind: 'PONENTE', title: 'Diluvio dello Jonio', effect: 'Ultima salva atterra mob minori per 1.2s.', vfx: 'Hit-Stop 3 frame, specchio d’acqua scuro.', statuses: [sp('STUN', 1.2, 's', 1.2)] },
            ],
          },
        },
        {
          branch: 'B',
          name: 'Sbarramento Tattico (Anti-Tiratori)',
          focus: 'Deviazione proiettili + accecamento tiratori',
          tier3: { title: '3B · Soppressione Balistica', effect: 'Devia proiettili nemici + Stagger ogni 1.5s.', vfx: 'Reticolo verde difensivo a terra.', statuses: [sp('STUN', 0.4, 's/1.5s', 3.5)] },
          tier4: { title: '4B · Precisione Tiratori Red', effect: '-15% precisione tiratori nemici (4.0s).', vfx: 'Polvere sollevata ai piedi nemici.', statuses: [sp('SLOW', 15, '% acc', 4)] },
          windRoutes: {
            LEVANTE: [
              { id: '5B1', tier: 5, wind: 'LEVANTE', title: 'Bagliore Soppressivo', effect: 'Acceca tiratori minori per 2.5s.', vfx: 'Lampo dorato orizzontale.', statuses: [sp('ROOT', 2.5, 's aim', 2.5)] },
              { id: '6B1', tier: 6, wind: 'LEVANTE', title: 'Difesa Ranged Party', effect: '-10% danni da distanza al party nell’area.', vfx: 'Bordo dorato sulle armature.', statuses: [] },
              { id: '7B1', tier: 7, wind: 'LEVANTE', title: "Baluardo Balistico d'Alba", effect: 'Distrugge istantaneamente tutti i proiettili in volo.', vfx: 'Hit-Stop 3 frame, stella solare dorata.', statuses: [] },
            ],
            PONENTE: [
              { id: '5B2', tier: 5, wind: 'PONENTE', title: 'Risacca Soppressiva', effect: 'SLOW -18% e blocco dash.', vfx: 'Pozza scura bordata d’arancio.', statuses: [sp('SLOW', 18, '%', 4), sp('ROOT', 1.5, 's dash', 4)] },
              { id: '6B2', tier: 6, wind: 'PONENTE', title: 'Estensione Debuff', effect: 'Debuff precisione esteso a 5.0s.', vfx: 'Bordi sfumati indaco scuro.', statuses: [] },
              { id: '7B2', tier: 7, wind: 'PONENTE', title: 'Crepuscolo dei Tiratori', effect: 'Tiratori colpiti subiscono Silenzio ranged per 2.0s.', vfx: 'Hit-Stop 3 frame, pozza marea scura.', statuses: [sp('ROOT', 2, 's ranged', 2)] },
            ],
          },
        },
        {
          branch: 'C',
          name: 'Salva di Rifornimento (Elisir)',
          focus: 'Stamina, Speed e Scudi sulle aree d’impatto',
          tier3: { title: '3C · Fiale d’Elisir', effect: '+15 Stamina e SHIELD 8 HP (3.5s) al party nell’area.', vfx: 'Decal verde tenue con arabeschi elfici.', statuses: [sp('REGEN', 15, 'stam', 1, 'party'), sp('SHIELD', 8, 'HP', 3.5, 'party')] },
          tier4: { title: '4C · Move Speed Party', effect: 'HASTE +8% velocità movimento nell’area.', vfx: 'Scie verdi radenti sotto i piedi.', statuses: [sp('HASTE', 8, '%', 3.5, 'party')] },
          windRoutes: {
            LEVANTE: [
              { id: '5C1', tier: 5, wind: 'LEVANTE', title: "Elisir dell'Alba", effect: 'Scudo 10 HP + purifica DoT attivi.', vfx: 'Decal dorata + raggi zenitali.', statuses: [sp('SHIELD', 10, 'HP', 3.5, 'party')] },
              { id: '6C1', tier: 6, wind: 'LEVANTE', title: 'Dardo di Rimbalzo', effect: 'Scudo colpito riflette 6 danni.', vfx: 'Scintilla dorata reattiva.', statuses: [] },
              { id: '7C1', tier: 7, wind: 'LEVANTE', title: "Benedizione d'Otranto", effect: 'Party nell’area: EMPOWER +8% (3.0s).', vfx: 'Hit-Stop 3 frame, pilastro d’oro.', statuses: [sp('EMPOWER', 8, '%', 3, 'party')] },
            ],
            PONENTE: [
              { id: '5C2', tier: 5, wind: 'PONENTE', title: 'Ristoro della Marea', effect: 'Party rigenera 2 HP/s (6 HP totali).', vfx: 'Decal indaco con riflessi arancio.', statuses: [sp('REGEN', 2, 'HP/s', 3, 'party')] },
              { id: '6C2', tier: 6, wind: 'PONENTE', title: 'Stamina Regen +18', effect: 'Rigenerazione stamina sale a +18/sec.', vfx: 'Increspature marine lente.', statuses: [sp('REGEN', 18, 'stam/s', 3.5, 'party')] },
              { id: '7C2', tier: 7, wind: 'PONENTE', title: 'Grazia dello Jonio', effect: 'Costo dash ridotto del 30% per tutto il party nell’area.', vfx: 'Hit-Stop 3 frame, specchio d’acqua calmo.', statuses: [sp('HASTE', 30, '% dash', 3.5, 'party')] },
            ],
          },
        },
      ],
    },
  },
];

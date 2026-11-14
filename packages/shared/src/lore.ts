/** World lore taken from the Malampu atlas (L'Eclissi della Dea Velata). */

export interface RegionDef {
  id: string;
  name: string;
  realName: string;
  subtitle: string;
  /** Position on the Salento map (atlas coordinates). */
  x: number;
  y: number;
  color: string;
  lore: string;
  government: string;
  /** Mission playable in this region, if any. */
  mission: string | null;
}

export const REGIONS: RegionDef[] = [
  {
    id: 'malya',
    name: 'Málya',
    realName: 'Maglie',
    subtitle: 'La Capitale Oligarchica',
    x: 650,
    y: 650,
    color: '#f59e0b',
    lore: "Il centro del potere militare e arcano del continente. Nel Distretto delle Guglie l'architettura è imponente e severa; nei bassifondi si trova il Q.B., l'emporio alchemico dove le classi sociali si scontrano.",
    government: "Oligarchia militare-arcana intrecciata con l'Ordine del Sole Nero.",
    mission: null,
  },
  {
    id: 'mur',
    name: 'Mur',
    realName: 'Muro Leccese',
    subtitle: 'Le Porte di Málya',
    x: 735,
    y: 665,
    color: '#ef4444',
    lore: 'Cittadina complessa e decadente, anticamera della capitale: intrighi nobiliari, segreti sussurrati e lusso torbido. Nei suoi vicoli più angusti sorge la Locanda di Calem, che muta con i cicli dell\'Eclissi.',
    government: 'Casate nobiliari decadenti, strette tra Málya e la teocrazia di San ä Rica.',
    mission: 'calem',
  },
  {
    id: 'sanarica',
    name: 'San ä Rica',
    realName: 'Sanarica',
    subtitle: 'Il Regno del Silenzio',
    x: 605,
    y: 785,
    color: '#6366f1',
    lore: 'Regno dogmatico e oscuro votato al silenzio e alla distruzione dell\'armonia. Patria di Klaus Kaballor. Nella Cattedrale Muta nessun suono si propaga.',
    government: "Teocrazia guidata dal Sommo Taciturno e dal Concilio dei Muti; serbatoio militare dell'Ordine del Sole Nero.",
    mission: 'cattedrale',
  },
  {
    id: 'jugianel',
    name: 'Jugianel',
    realName: 'Giuggianello',
    subtitle: 'Il Matriarcato Mistico',
    x: 655,
    y: 480,
    color: '#22c55e',
    lore: 'Terre del Nord, aspre e orgogliose, governate da Matriarche. Creduta terra di barbari, nasconde rovine ricchissime e il Giardino del Fiolar, cerchio di monoliti sacri.',
    government: 'Matriarcato occulto dietro una facciata di primitivismo barbarico.',
    mission: null,
  },
  {
    id: 'minervin',
    name: 'Miner-Vin',
    realName: 'Minervino di Lecce',
    subtitle: 'La Terra Rossa',
    x: 785,
    y: 585,
    color: '#ea580c',
    lore: 'Colline di terra rossa ricca di minerali: secondo il mito, il sangue della Madre Rossa caduta. Nelle Gallerie Fiorite crescono funghi e muschi bioluminescenti.',
    government: 'Confederazione di Comunelle di Cava rette dalla Confraternita delle Radici.',
    mission: null,
  },
  {
    id: 'ujian',
    name: 'Ujian & Kaza-Massel',
    realName: 'Uggiano La Chiesa & Casamassella',
    subtitle: 'Le Città-Stato del Caos',
    x: 925,
    y: 650,
    color: '#a855f7',
    lore: 'Ujian sorge su un altopiano calcareo permeato di antica magia: oggi è una prigione a cielo aperto. Ai suoi confini, Kaza-Massel: baraccopoli labirintica dei reietti e rifugio di creature instabili.',
    government: "Città-stato sorvegliata dall'Ordine; Kaza-Massel sopravvive nell'anarchia dei sindacati criminali.",
    mission: 'kaza',
  },
  {
    id: 'badiscar',
    name: 'Badiscar',
    realName: 'Porto Badisco',
    subtitle: 'Le Terre Libere',
    x: 1018,
    y: 705,
    color: '#0ea5e9',
    lore: 'Rifugio aspro per contrabbandieri e liberi pensatori, base della Compagnia. A picco sulle scogliere, la Taverna di Carl ospita i Consigli dell\'Eclissi.',
    government: 'Zona franca retta dalla tregua della Taverna di Carl.',
    mission: null,
  },
  {
    id: 'otranth',
    name: 'Otranth',
    realName: 'Otranto',
    subtitle: 'Il Porto delle Mille Lingue',
    x: 985,
    y: 575,
    color: '#14b8a6',
    lore: 'Città portuale di confine dove le culture si mescolano e tutti parlano almeno tre lingue. Primo grande porto lungo la rotta verso nord.',
    government: 'Porto franco retto dal Consiglio dei Quattro Moli e dalla dogana dei Pesatori.',
    mission: null,
  },
];

export interface AllyDef {
  id: string;
  name: string;
  role: string;
  desc: string;
}

export const ALLIES: AllyDef[] = [
  { id: 'carlos', name: 'Carlos, il Consigliere Ombra', role: 'Ex diplomatico e mentore riluttante', desc: "Attende la Compagnia alla Taverna di Carl. Guida il gruppo con un'ironia tagliente." },
  { id: 'sarya', name: 'Sàrya di Vael', role: 'Diplomatica in esilio', desc: 'Custode di lingue antiche e di segreti sulla Madre Originale.' },
  { id: 'eleonora', name: 'Eleonora la Magnifica', role: 'Broker e patrona', desc: 'Architetto invisibile delle rotte commerciali: sa in anticipo dove si muove il Sole Nero.' },
  { id: 'sec', name: "Sec, il Divoratore d'Incanto", role: 'Vampiro antico', desc: 'Dimora nelle cripte sotto Kaza-Massel. Alleato, o forse soltanto ombra.' },
  { id: 'lucius', name: 'Lucius, Dispensatore di Sorrisi', role: 'Alchimista ambiguo', desc: 'Offre pozioni gratis con allegria eccessiva.' },
  { id: 'mishian', name: "Mishian, l'Erborista", role: 'Pilastro curativo', desc: "La «madre» del gruppo: l'unica che calma Vyncent." },
  { id: 'crystoan', name: "Crystoan, l'Orco Errante", role: 'Guida e rete di informazioni', desc: 'Mole imponente e bontà disarmante.' },
  { id: 'saraya', name: 'Saraya di Mur', role: 'Mediatrice ancestrale', desc: 'Voce della calma, capace di mediare tra fazioni opposte.' },
  { id: 'ritzer', name: "Ritzer, Goblin dell'Orizzonte", role: 'Esploratore immune ai veleni', desc: 'Assaggiatore ufficiale delle pozioni di Mishian.' },
  { id: 'raphal', name: "Raphal, Custode d'Inchiostro", role: 'Protettore silenzioso', desc: 'Corpo coperto di sigilli di contenimento. Sorveglia Lucius.' },
];

export const HUB_LINES: string[] = [
  "Benvenuti alla Taverna di Carl. La tregua vale per tutti, persino per voi.",
  "Scegliete chi siete, poi avvicinatevi alla tavola del Consiglio: la mappa non si legge da sola.",
  'Il fantoccio nel retro non si offende. Usatelo per imparare a parare prima di imparare a sanguinare.',
];

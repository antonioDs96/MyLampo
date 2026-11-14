export * from './constants';
export * from './math';
export * from './types';
export * from './heroes';
export * from './enemies';
export * from './layout';
export * from './missions';
export * from './lore';
export * from './player';
export * from './partyScale';
export * from './world';
export * from './protocol';
export * from './progress';
export * from './host';
export * from './itemsCatalog';
export * from './dndMegabonkRules';
export * from './lootSystem';
export * from './gearArchive';
export * from './effectQueue';
export * from './proceduralBiomes';
export * from './bestiaryCatalog';
export * from './missionSystem';
export * from './bossLootSystem';

import { buildBossWeaponDefs } from './bossLootSystem';
import { registerBossWeapons } from './itemsCatalog';

registerBossWeapons(buildBossWeaponDefs());

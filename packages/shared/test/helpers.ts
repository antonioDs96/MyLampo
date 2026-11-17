import { Btn, parseLayout, World, type InputCmd, type LayoutDef } from '../src';

export const ARENA: LayoutDef = {
  id: 'test',
  name: 'Test',
  theme: 'alley',
  rows: [
    '###########',
    '#.........#',
    '#.........#',
    '#....P....#',
    '#.........#',
    '#.........#',
    '#.........#',
    '#....E....#',
    '#.........#',
    '###########',
  ],
};

export function makeWorld(seed = 7, def: LayoutDef = ARENA): World {
  return new World({ layout: parseLayout(def), seed });
}

let seq = 0;
export function cmd(partial: Partial<InputCmd> = {}): InputCmd {
  return { seq: ++seq, mx: 0, mz: 0, buttons: 0, aim: 0, lock: 0, ...partial };
}

/** Runs `ticks` player steps with the given input, advancing the world at 20 Hz alongside. */
export function run(world: World, id: string, ticks: number, input: Partial<InputCmd> = {}): void {
  for (let i = 0; i < ticks; i++) {
    world.applyCommand(id, cmd(input));
    if (i % 3 === 2) world.step(1 / 20);
  }
}

/** Presses a button for one tick. */
export function tap(world: World, id: string, button: number, extra: Partial<InputCmd> = {}): void {
  world.applyCommand(id, cmd({ ...extra, buttons: button }));
}

export { Btn };

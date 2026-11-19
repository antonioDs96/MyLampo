/**
 * Blood Gate barriers: translucent red slabs on sealed cells. They dissolve when
 * the garrison's toll is paid; the local layout is sealed and opened in lockstep
 * so client prediction never walks through a closed gate.
 */
import { Color3, Mesh, MeshBuilder, type Scene, StandardMaterial, TransformNode } from '@babylonjs/core';
import { CELL, setGateSealed, STEP_HEIGHT, type GateDef, type Layout } from '@malampu/shared';
import { FLOOR_Y } from './arena';

export interface GateProgress {
  open: boolean;
  kills: number;
  need: number;
  elites: number;
  needElites: number;
}

export class BloodGatesView {
  private root: TransformNode | null = null;
  private slabs: Mesh[][] = [];
  private mats: StandardMaterial[] = [];
  private open: boolean[] = [];
  private progress: GateProgress[] = [];

  rebuild(scene: Scene, layout: Layout): void {
    this.dispose();
    const gates = layout.def.gates ?? [];
    if (gates.length === 0) return;
    this.root = new TransformNode('bloodGates', scene);
    for (const [index, gate] of gates.entries()) {
      const mat = new StandardMaterial(`bgMat${index}`, scene);
      mat.diffuseColor = new Color3(0.72, 0.08, 0.12);
      mat.emissiveColor = new Color3(0.35, 0.02, 0.04);
      mat.alpha = 0.55;
      mat.specularColor = new Color3(0.2, 0.05, 0.05);
      mat.backFaceCulling = false;
      this.mats.push(mat);
      const group: Mesh[] = [];
      for (const [cx, cz] of gate.cells) {
        const mesh = MeshBuilder.CreateBox(
          `bg${index}_${cx}_${cz}`,
          { width: CELL * 0.95, height: STEP_HEIGHT * 2.4, depth: CELL * 0.95 },
          scene,
        );
        mesh.parent = this.root;
        mesh.material = mat;
        mesh.position.set(cx * CELL + CELL * 0.5, FLOOR_Y + STEP_HEIGHT * 1.2, cz * CELL + CELL * 0.5);
        mesh.isPickable = false;
        group.push(mesh);
      }
      this.slabs.push(group);
      this.open.push(false);
      this.progress.push({ open: false, kills: 0, need: gate.kills, elites: 0, needElites: gate.elites });
      setGateSealed(layout, gate, true);
    }
  }

  /** Applies the host's gate array: [open, kills, need, elites, needElites]. */
  sync(raw: number[][] | undefined, layout: Layout): GateDef | null {
    const gates = layout.def.gates ?? [];
    if (!raw || gates.length === 0) return null;
    let opened: GateDef | null = null;
    for (let i = 0; i < gates.length; i++) {
      const row = raw[i];
      if (!row) continue;
      const wasOpen = this.open[i] === true;
      const nowOpen = row[0] === 1;
      this.progress[i] = {
        open: nowOpen,
        kills: row[1] ?? 0,
        need: row[2] ?? gates[i]!.kills,
        elites: row[3] ?? 0,
        needElites: row[4] ?? gates[i]!.elites,
      };
      if (wasOpen === nowOpen) continue;
      this.open[i] = nowOpen;
      setGateSealed(layout, gates[i]!, !nowOpen);
      for (const mesh of this.slabs[i] ?? []) mesh.setEnabled(!nowOpen);
      if (nowOpen && !wasOpen) opened = gates[i]!;
    }
    return opened;
  }

  /** Force-open one gate from the `gate` event (in case the snapshot trails). */
  openGate(index: number, layout: Layout): GateDef | null {
    const gate = layout.def.gates?.[index];
    if (!gate || this.open[index]) return null;
    this.open[index] = true;
    if (this.progress[index]) this.progress[index]!.open = true;
    setGateSealed(layout, gate, false);
    for (const mesh of this.slabs[index] ?? []) mesh.setEnabled(false);
    return gate;
  }

  nearest(x: number, z: number, layout: Layout): { gate: GateDef; progress: GateProgress; dist: number } | null {
    const gates = layout.def.gates ?? [];
    let best: { gate: GateDef; progress: GateProgress; dist: number } | null = null;
    for (let i = 0; i < gates.length; i++) {
      if (this.open[i]) continue;
      const gate = gates[i]!;
      let dist = Infinity;
      for (const [cx, cz] of gate.cells) {
        const d = Math.hypot(x - (cx * CELL + CELL * 0.5), z - (cz * CELL + CELL * 0.5));
        if (d < dist) dist = d;
      }
      if (!best || dist < best.dist) best = { gate, progress: this.progress[i]!, dist };
    }
    return best;
  }

  dispose(): void {
    for (const group of this.slabs) for (const mesh of group) mesh.dispose();
    for (const mat of this.mats) mat.dispose();
    this.root?.dispose();
    this.root = null;
    this.slabs = [];
    this.mats = [];
    this.open = [];
    this.progress = [];
  }
}

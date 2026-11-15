import { Client, type Room } from '@colyseus/sdk';
import { GameHost, type ClientMsg, type GearArchive, type ServerMsg } from '@malampu/shared';

export interface Connection {
  /** True when the whole game runs inside this browser tab. */
  readonly offline: boolean;
  /** `at` is when the message arrived (performance.now), which may be well before this frame. */
  onMessage: (msg: ServerMsg, at: number) => void;
  onClose: (reason: string) => void;
  send(msg: ClientMsg): void;
  /** Called every frame with a monotonic clock in ms. */
  update(nowMs: number): void;
  /** Solo only: freeze the in-memory host while menus / scheda are open. */
  setPaused?(on: boolean, nowMs?: number): void;
  close(): void;
}

const LOCAL_ID = 'solo';

/** Runs the same game host the server uses, in memory, for solo play without a server. */
export class LocalConnection implements Connection {
  readonly offline = true;
  onMessage: (msg: ServerMsg, at: number) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private readonly host: GameHost;
  private readonly inbox: ServerMsg[] = [];
  private closed = false;
  /** Mirrors host pause so we only transition on edges (avoids per-frame unpause calls). */
  private paused = false;

  constructor(name: string, archive?: GearArchive) {
    const deliver = (msg: ServerMsg) => this.inbox.push(msg);
    this.host = new GameHost(
      { send: (_id, msg) => deliver(msg), broadcast: deliver },
      'SOLO',
      (Math.random() * 0xffffffff) >>> 0,
      archive,
    );
    this.host.join(LOCAL_ID, name);
  }

  send(msg: ClientMsg): void {
    if (!this.closed) this.host.onMessage(LOCAL_ID, msg);
  }

  setPaused(on: boolean, nowMs = performance.now()): void {
    if (this.closed || on === this.paused) return;
    this.paused = on;
    if (on) this.host.pause();
    else this.host.unpause(nowMs);
  }

  update(nowMs: number): void {
    if (this.closed) return;
    // host.update is a no-op while paused; inbox (welcome/lobby/world) must still flush.
    this.host.update(nowMs);
    if (this.inbox.length === 0) return;
    const batch = this.inbox.splice(0);
    for (const msg of batch) this.onMessage(msg, nowMs);
  }

  close(): void {
    this.closed = true;
  }
}

export function serverEndpoint(): string {
  return endpoint();
}

function endpoint(): string {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return override;
  // In development the game server runs next to the Vite dev server on its own port.
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`;
  return location.origin;
}

function describe(err: unknown, pub = false): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/not found|invalid|no rooms|locked|full/i.test(text)) {
    return pub
      ? 'La taverna pubblica non è raggiungibile adesso. Riprova tra poco.'
      : 'Stanza non trovata o al completo. Controlla il codice.';
  }
  return 'Impossibile raggiungere il server. Riprova tra poco, oppure gioca in solitaria.';
}

export class RemoteConnection implements Connection {
  readonly offline = false;
  onMessage: (msg: ServerMsg, at: number) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private readonly inbox: { msg: ServerMsg; at: number }[] = [];
  private closed = false;

  private constructor(private readonly room: Room) {
    room.onMessage('m', (msg: ServerMsg) => this.inbox.push({ msg, at: performance.now() }));
    room.onLeave((code: number) => {
      if (this.closed) return;
      this.closed = true;
      this.onClose(code === 4000 ? 'La stanza è al completo.' : 'Connessione al server interrotta.');
    });
    room.onError((_code: number, message?: string) => console.warn('room error', message));
  }

  /** Creates a private room, joins one by code, or walks into the public tavern. */
  static async open(name: string, code: string | null, pub = false): Promise<RemoteConnection> {
    const client = new Client(endpoint());
    try {
      const room = code
        ? await client.joinById(code.trim().toUpperCase(), { name })
        : pub
          ? await client.joinOrCreate('malampu', { name, public: true })
          : await client.create('malampu', { name });
      return new RemoteConnection(room as Room);
    } catch (err) {
      throw new Error(describe(err, pub), { cause: err });
    }
  }

  send(msg: ClientMsg): void {
    if (!this.closed) this.room.send('m', msg);
  }

  update(): void {
    if (this.inbox.length === 0) return;
    const batch = this.inbox.splice(0);
    for (const m of batch) this.onMessage(m.msg, m.at);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    void this.room.leave(true);
  }
}

import { Client, type Room } from '@colyseus/sdk';
import { GameHost, type ClientMsg, type ServerMsg } from '@malampu/shared';

export interface Connection {
  /** True when the whole game runs inside this browser tab. */
  readonly offline: boolean;
  onMessage: (msg: ServerMsg) => void;
  onClose: (reason: string) => void;
  send(msg: ClientMsg): void;
  /** Called every frame with a monotonic clock in ms. */
  update(nowMs: number): void;
  close(): void;
}

const LOCAL_ID = 'solo';

/** Runs the same game host the server uses, in memory, for solo play without a server. */
export class LocalConnection implements Connection {
  readonly offline = true;
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private readonly host: GameHost;
  private readonly inbox: ServerMsg[] = [];
  private closed = false;

  constructor(name: string) {
    const deliver = (msg: ServerMsg) => this.inbox.push(msg);
    this.host = new GameHost({ send: (_id, msg) => deliver(msg), broadcast: deliver }, 'SOLO', (Math.random() * 0xffffffff) >>> 0);
    this.host.join(LOCAL_ID, name);
  }

  send(msg: ClientMsg): void {
    if (!this.closed) this.host.onMessage(LOCAL_ID, msg);
  }

  update(nowMs: number): void {
    if (this.closed) return;
    this.host.update(nowMs);
    if (this.inbox.length === 0) return;
    const batch = this.inbox.splice(0);
    for (const msg of batch) this.onMessage(msg);
  }

  close(): void {
    this.closed = true;
  }
}

function endpoint(): string {
  const override = new URLSearchParams(location.search).get('server');
  if (override) return override;
  // In development the game server runs next to the Vite dev server on its own port.
  if (import.meta.env.DEV) return `${location.protocol}//${location.hostname}:2567`;
  return location.origin;
}

function describe(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  if (/not found|invalid|no rooms|locked|full/i.test(text)) return 'Stanza non trovata o al completo. Controlla il codice.';
  return 'Impossibile raggiungere il server. Riprova tra poco, oppure gioca in solitaria.';
}

export class RemoteConnection implements Connection {
  readonly offline = false;
  onMessage: (msg: ServerMsg) => void = () => {};
  onClose: (reason: string) => void = () => {};
  private readonly inbox: ServerMsg[] = [];
  private closed = false;

  private constructor(private readonly room: Room) {
    room.onMessage('m', (msg: ServerMsg) => this.inbox.push(msg));
    room.onLeave((code: number) => {
      if (this.closed) return;
      this.closed = true;
      this.onClose(code === 4000 ? 'La stanza è al completo.' : 'Connessione al server interrotta.');
    });
    room.onError((_code: number, message?: string) => console.warn('room error', message));
  }

  /** Creates a new room, or joins the one with the given code. */
  static async open(name: string, code: string | null): Promise<RemoteConnection> {
    const client = new Client(endpoint());
    try {
      const room = code ? await client.joinById(code.trim().toUpperCase(), { name }) : await client.create('malampu', { name });
      return new RemoteConnection(room as Room);
    } catch (err) {
      throw new Error(describe(err), { cause: err });
    }
  }

  send(msg: ClientMsg): void {
    if (!this.closed) this.room.send('m', msg);
  }

  update(): void {
    if (this.inbox.length === 0) return;
    const batch = this.inbox.splice(0);
    for (const msg of batch) this.onMessage(msg);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    void this.room.leave(true);
  }
}

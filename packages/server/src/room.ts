import { matchMaker, Room, type Client } from '@colyseus/core';
import { GameHost, MAX_PLAYERS, type ClientMsg, type ServerMsg } from '@malampu/shared';

/** Letters and digits that are hard to confuse when read aloud or typed from a chat. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_MESSAGE_ITEMS = 6 * 60;

export const ROOM_NAME = 'malampu';
/** Single message channel: the payload itself says what it is (`t`). */
export const CHANNEL = 'm';
export const CLOSE_ROOM_FULL = 4000;

function randomCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return code;
}

async function freeCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = randomCode();
    if (!(await matchMaker.getRoomById(code))) return code;
  }
  throw new Error('no free room code');
}

/** One party of up to eight friends. All game rules live in the shared GameHost. */
export class MalampuRoom extends Room {
  private host!: GameHost;

  override async onCreate(): Promise<void> {
    this.maxClients = MAX_PLAYERS;
    this.autoDispose = true;
    // State is sent as explicit snapshot messages, not through schema patches.
    this.patchRate = null;
    this.roomId = await freeCode();

    this.host = new GameHost(
      {
        send: (id, msg) => this.clients.getById(id)?.send(CHANNEL, msg),
        broadcast: (msg: ServerMsg) => this.broadcast(CHANNEL, msg),
      },
      this.roomId,
      (Math.random() * 0xffffffff) >>> 0,
    );

    this.onMessage(CHANNEL, (client: Client, msg: ClientMsg) => {
      if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return;
      if (msg.t === 'i' && (!Array.isArray(msg.c) || msg.c.length > MAX_MESSAGE_ITEMS)) return;
      this.host.onMessage(client.sessionId, msg);
    });

    // The host advances in its own fixed 50 ms ticks; polling faster keeps the tick jitter low.
    this.setSimulationInterval(() => this.host.update(performance.now()), 1000 / 60);
  }

  override onJoin(client: Client, options?: { name?: unknown }): void {
    if (!this.host.join(client.sessionId, options?.name)) client.leave(CLOSE_ROOM_FULL);
  }

  override onLeave(client: Client): void {
    this.host.leave(client.sessionId);
  }
}

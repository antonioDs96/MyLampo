import { randomBytes } from 'node:crypto';
import { matchMaker, Room, type Client } from '@colyseus/core';
import { GameHost, MAX_PLAYERS, PUBLIC_ROOM_ID, type ClientMsg, type ProfileArchive, type ServerMsg } from '@malampu/shared';
import { createServerJevAdvisor } from './jev';
import { createQuipWriter } from './quips';

/** Letters and digits that are hard to confuse when read aloud or typed from a chat. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_MESSAGE_ITEMS = 6 * 60;

export const ROOM_NAME = 'malampu';
/** Single message channel: the payload itself says what it is (`t`). */
export const CHANNEL = 'm';
export const CLOSE_ROOM_FULL = 4000;

/**
 * Proves a room was opened by this process. A client can ask for `public: true`
 * (that only makes an extra tavern that closes when empty) but cannot claim the
 * anchor id.
 */
const ANCHOR_TOKEN = randomBytes(24).toString('hex');

let acceptingPublic = true;

interface RoomOptions {
  archive?: ProfileArchive;
  public?: boolean;
  anchorToken?: string;
}

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

/** Opens the tavern that stays up for anyone, if this process is still accepting players. */
export function openPublicRooms(): void {
  acceptingPublic = true;
}

/** Stop recreating the public tavern while the process is shutting down. */
export function closePublicRooms(): void {
  acceptingPublic = false;
}

export async function ensurePublicRoom(): Promise<void> {
  if (!acceptingPublic) return;
  if (await matchMaker.getRoomById(PUBLIC_ROOM_ID)) return;
  await matchMaker.createRoom(ROOM_NAME, { public: true, anchorToken: ANCHOR_TOKEN });
}

/** One party of up to nine. All game rules live in the shared GameHost. */
export class MalampuRoom extends Room<{ metadata: { public: boolean } }> {
  private host!: GameHost;
  private archive?: ProfileArchive;
  /** The tavern that outlives its players and is recreated if the process drops it. */
  private anchor = false;
  private isPublic = false;

  override async onCreate(options?: RoomOptions): Promise<void> {
    this.maxClients = MAX_PLAYERS;
    // State is sent as explicit snapshot messages, not through schema patches.
    this.patchRate = null;
    this.archive = options?.archive;
    this.anchor = options?.anchorToken === ANCHOR_TOKEN;
    this.isPublic = this.anchor || options?.public === true;
    // Private rooms and overflow taverns close when the last player leaves.
    // The anchor stays listed so the next person still has somewhere to walk in.
    this.autoDispose = !this.anchor;
    this.roomId = this.anchor ? PUBLIC_ROOM_ID : await freeCode();

    this.bootHost();

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
    // Colyseus has already dropped this client. An empty anchor goes back to the
    // Hero Selection so the next company does not inherit a deserted expedition.
    if (this.anchor && this.clients.length === 0) this.bootHost();
  }

  override onDispose(): void {
    if (!this.anchor || !acceptingPublic) return;
    queueMicrotask(() => {
      void ensurePublicRoom().catch((err) => console.error('taverna pubblica', err));
    });
  }

  private bootHost(): void {
    this.host = new GameHost(
      {
        send: (id, msg) => this.clients.getById(id)?.send(CHANNEL, msg),
        broadcast: (msg: ServerMsg) => this.broadcast(CHANNEL, msg),
      },
      this.roomId,
      (Math.random() * 0xffffffff) >>> 0,
      this.archive,
      this.isPublic,
      createServerJevAdvisor(),
      createQuipWriter(),
    );
  }
}

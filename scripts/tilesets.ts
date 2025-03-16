import { getPublicKey, nip19 } from "nostr-tools";
import { createRxNostr } from "rx-nostr";
import { verifier, seckeySigner } from "rx-nostr-crypto";
import fs from "fs";
import path from "path";
import WebSocket from "ws";

// Add WebSocket to global scope for rx-nostr
(global as any).WebSocket = WebSocket;

const relays = [
  //   "ws://localhost:8080",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net",
  //   "wss://relay.snort.social",
];

interface Tileset {
  columns: number;
  firstgid: number;
  image: string;
  imageheight: number;
  imagewidth: number;
  margin: number;
  name: string;
  spacing: number;
  tilecount: number;
  tileheight: number;
  tilewidth: number;
  tiles?: {
    id: number;
    properties: Array<{
      name: string;
      type: string;
      value: boolean;
    }>;
  }[];
  orientation?: string;
}

interface TiledMap {
  tilesets: Tileset[];
}

interface EventData {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
}

function transformTileProperties(
  tiles: Tileset["tiles"]
): Record<number, Record<string, boolean>> {
  if (!tiles) return {};

  const result: Record<number, Record<string, boolean>> = {};

  for (const tile of tiles) {
    const properties: Record<string, boolean> = {};

    for (const prop of tile.properties) {
      if (prop.value === true) {
        properties[prop.name] = true;
      }
    }

    if (Object.keys(properties).length > 0) {
      result[tile.id] = properties;
    }
  }

  return result;
}

function createTilesetEvent(
  privateKey: Uint8Array,
  tileset: Tileset,
  dTag: string
): EventData {
  const event = {
    kind: 31113,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", `${dTag}:tileset:${tileset.name}`],
      ["name", tileset.name],
      ["firstgid", tileset.firstgid.toString()],
      ["tilewidth", tileset.tilewidth.toString()],
      ["tileheight", tileset.tileheight.toString()],
      ["orientation", "orthogonal"],
      ["margin", tileset.margin.toString()],
      ["spacing", tileset.spacing.toString()],
    ],
    content: JSON.stringify(transformTileProperties(tileset.tiles)),
    pubkey: getPublicKey(privateKey),
  };

  return event;
}

async function main() {
  // Get command line arguments
  const [, , dTag, tilemapPath, nsec] = process.argv;

  if (!dTag || !tilemapPath || !nsec) {
    console.error("Usage: npm run tilesets <d-tag> <tilemap-path> <nsec>");
    process.exit(1);
  }

  try {
    // Decode nsec
    const { type, data: privateKey } = nip19.decode(nsec);
    if (type !== "nsec") {
      throw new Error("Invalid nsec format");
    }

    // Read and parse tilemap
    const tilemapContent = fs.readFileSync(path.resolve(tilemapPath), "utf-8");
    const tilemap: TiledMap = JSON.parse(tilemapContent);

    // Process each tileset
    const events: EventData[] = [];
    for (const tileset of tilemap.tilesets) {
      const event = createTilesetEvent(privateKey, tileset, dTag);
      events.push(event);
    }

    // Publish events to Nostr
    const rxNostr = createRxNostr({
      signer: seckeySigner(nsec),
      verifier,
    });

    rxNostr.setDefaultRelays(relays);

    for (const event of events) {
      console.log("Publishing event:", JSON.stringify(event, null, 2));
      rxNostr.send(event);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("FINISHED");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();

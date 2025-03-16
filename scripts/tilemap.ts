import { getPublicKey, nip19 } from "nostr-tools";
import { createRxNostr } from "rx-nostr";
import { verifier, seckeySigner } from "rx-nostr-crypto";
import fs from "fs";
import path from "path";
import WebSocket from "ws";

// Add WebSocket to global scope for rx-nostr
(global as any).WebSocket = WebSocket;

const relays = [
  // "ws://localhost:8080",
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://nostr-pub.wellorder.net",
  // "wss://relay.snort.social",
];

interface TilemapChunk {
  data: number[];
  height: number;
  width: number;
  x: number;
  y: number;
}

interface TilemapLayer {
  chunks: TilemapChunk[];
  name: string;
}

interface Tilemap {
  layers: TilemapLayer[];
}

interface EventData {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
  pubkey: string;
}

function createNostrEvent(
  privateKey: Uint8Array,
  layerName: string,
  chunk: TilemapChunk,
  dTag: string
): EventData {
  const event = {
    kind: 31112,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", `${dTag}:${layerName}:${chunk.x}:${chunk.y}`],
      ["layer", layerName],
      ["x", chunk.x.toString()],
      ["y", chunk.y.toString()],
      ["width", chunk.width.toString()],
      ["height", chunk.height.toString()],
    ],
    content: JSON.stringify(chunk.data),
    pubkey: getPublicKey(privateKey),
  };

  return event;
}

async function main() {
  // Get command line arguments
  const [, , dTag, tilemapPath, nsec] = process.argv;

  if (!dTag || !tilemapPath || !nsec) {
    console.error("Usage: npm run tilemap <d-tag> <tilemap-path> <nsec>");
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
    const tilemap: Tilemap = JSON.parse(tilemapContent);

    // Process each layer and chunk
    const events: EventData[] = [];
    for (const layer of tilemap.layers) {
      if (!layer.chunks) continue;

      for (const chunk of layer.chunks) {
        const event = createNostrEvent(privateKey, layer.name, chunk, dTag);
        events.push(event);
      }
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

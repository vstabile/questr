import Phaser from "phaser";
import { Player } from "../objects/Player";
import { NostrService } from "../services/NostrService";

export class ChunkManager {
  private scene: Phaser.Scene;
  private tileSize: number;
  private nostrService: NostrService;
  private tileset: Phaser.Tilemaps.Tileset | null;
  private map: Phaser.Tilemaps.Tilemap;
  private loadDistance: number;
  private player: Player;
  private layers: Map<string, Phaser.Tilemaps.TilemapLayer>;
  private lastPlayerChunkX: number = 0;
  private lastPlayerChunkY: number = 0;
  private chunkWidth: number = 16;
  private chunkHeight: number = 16;

  constructor(
    scene: Phaser.Scene,
    tileSize: number,
    player: Player,
    loadDistance: number = 1
  ) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.layers = new Map<string, Phaser.Tilemaps.TilemapLayer>();
    this.loadDistance = loadDistance;
    this.player = player;
    this.nostrService = NostrService.getInstance();

    // Create the tilemap
    this.map = scene.make.tilemap({
      tileWidth: 32,
      tileHeight: 32,
      width: 1000,
      height: 1000,
    });

    this.tileset = this.map.addTilesetImage("tiles", "tiles", 32, 32, 1, 2, 1);

    if (!this.tileset) {
      console.error("Failed to load tilesets");
      return;
    }

    const belowLayer = this.map.createBlankLayer(
      "Below Player",
      this.tileset,
      0,
      0,
      112,
      128
    );
    const worldLayer = this.map.createBlankLayer(
      "World",
      this.tileset,
      0,
      0,
      96,
      80
    );
    const aboveLayer = this.map.createBlankLayer(
      "Above Player",
      this.tileset,
      0,
      0,
      48,
      80
    );

    if (!belowLayer || !worldLayer || !aboveLayer) {
      console.error("Failed to create layers");
      return;
    }

    // worldLayer.setCollisionByProperty({ collides: true });
    aboveLayer.setDepth(10);

    this.layers.set("Below Player", belowLayer);
    this.layers.set("World", worldLayer);
    this.layers.set("Above Player", aboveLayer);

    this.nostrService.addChunkEventListener(this.handleChunkUpdate.bind(this));
  }

  private handleChunkUpdate(event: any): void {
    const layerName = event.tags.find((tag: any) => tag[0] === "layer")?.[1];
    const x = parseInt(event.tags.find((tag: any) => tag[0] === "x")?.[1]);
    const y = parseInt(event.tags.find((tag: any) => tag[0] === "y")?.[1]);
    const tiles = JSON.parse(event.content);

    if (!layerName || isNaN(x) || isNaN(y) || !Array.isArray(tiles)) return;

    const layer = this.layers.get(layerName);

    if (!layer) {
      console.error("Layer not found", layerName);
      return;
    }

    layer.putTilesAt(tiles, x, y);

    console.log("Chunk update", layerName, x, y, tiles);
  }

  // Get chunk coordinates from world position
  getChunkCoordFromPosition(
    x: number,
    y: number
  ): { chunkX: number; chunkY: number } {
    const chunkX = Math.floor(x / (this.tileSize * this.chunkWidth));
    const chunkY = Math.floor(y / (this.tileSize * this.chunkHeight));
    return { chunkX, chunkY };
  }

  // Get chunk key from chunk coordinates
  getChunkKey(chunkX: number, chunkY: number): string {
    return `${chunkX * 16}:${chunkY * 16}`;
  }

  // Update which chunks are loaded based on player position
  update(): void {
    const { chunkX, chunkY } = this.getChunkCoordFromPosition(
      this.player.x,
      this.player.y
    );

    // Only update chunks if player moved to a new chunk
    if (chunkX !== this.lastPlayerChunkX || chunkY !== this.lastPlayerChunkY) {
      this.updateChunks(chunkX, chunkY);
      this.lastPlayerChunkX = chunkX;
      this.lastPlayerChunkY = chunkY;
    }
  }

  // Update chunks around the player
  private updateChunks(playerChunkX: number, playerChunkY: number): void {
    console.log("playerChunk", playerChunkX, playerChunkY);

    const chunksToKeep = new Set<string>();

    // Determine which chunks should be loaded
    for (let x = -this.loadDistance; x <= this.loadDistance; x++) {
      for (let y = -this.loadDistance; y <= this.loadDistance; y++) {
        const chunkX = playerChunkX + x;
        const chunkY = playerChunkY + y;
        const chunkKey = this.getChunkKey(chunkX, chunkY);

        chunksToKeep.add(chunkKey);
      }
    }

    console.log("chunksToKeep", chunksToKeep);
    this.nostrService.fetchChunkEvents(Array.from(chunksToKeep));
  }
}

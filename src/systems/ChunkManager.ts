import Phaser from "phaser";
import { Player } from "../objects/Player";
import { NostrService } from "../services/NostrService";

export class ChunkManager {
  private scene: Phaser.Scene;
  private tileSize: number;
  private nostrService: NostrService;
  private map: Phaser.Tilemaps.Tilemap;
  private tilesets: Map<string, Phaser.Tilemaps.Tileset>;
  private layers: Map<string, Phaser.Tilemaps.TilemapLayer>;
  private loadDistance: number;
  private player: Player;
  private lastPlayerChunkX: number = 0;
  private lastPlayerChunkY: number = 0;
  private chunkWidth: number = 16;
  private chunkHeight: number = 16;

  constructor(
    scene: Phaser.Scene,
    tileSize: number,
    player: Player,
    tilesetConfig: {
      name: string;
      imageKey: string;
      tileWidth: number;
      tileHeight: number;
      margin: number;
      spacing: number;
      firstgid: number;
      tileProperties: Record<number, Record<string, boolean>>;
    },
    loadDistance: number = 1
  ) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.player = player;
    this.loadDistance = loadDistance;
    this.nostrService = NostrService.getInstance();
    this.tilesets = new Map();
    this.layers = new Map();

    // Create the base tilemap
    this.map = scene.make.tilemap({
      tileWidth: tileSize,
      tileHeight: tileSize,
      width: 1000,
      height: 1000,
    });

    // Initialize with tileset
    this.initializeTileset(tilesetConfig);

    this.nostrService.addChunkEventListener(this.handleChunkUpdate.bind(this));
  }

  private initializeTileset(config: {
    name: string;
    imageKey: string;
    tileWidth: number;
    tileHeight: number;
    margin: number;
    spacing: number;
    firstgid: number;
    tileProperties: Record<number, Record<string, boolean>>;
  }): void {
    const tileset = this.map.addTilesetImage(
      config.name,
      config.imageKey,
      config.tileWidth,
      config.tileHeight,
      config.margin,
      config.spacing,
      config.firstgid
    );

    if (!tileset) {
      console.error(`Failed to add tileset: ${config.name}`);
      return;
    }

    this.tilesets.set(config.name, tileset);
    this.createLayers(tileset);

    // Set up collision properties for the World layer
    const worldLayer = this.layers.get("World");
    if (worldLayer) {
      // Set collisions based on tile properties
      Object.entries(config.tileProperties).forEach(([tileId, properties]) => {
        if (properties.collides) {
          // Add firstgid to the tile ID since the properties are stored with local IDs
          const globalTileId = parseInt(tileId) + config.firstgid;
          worldLayer.setCollision(globalTileId);
        }
      });

      // Add the collider
      this.scene.physics.add.collider(this.player, worldLayer);
    }
  }

  private createLayers(tileset: Phaser.Tilemaps.Tileset): void {
    const belowLayer = this.map.createBlankLayer("Below Player", tileset, 0, 0);
    const worldLayer = this.map.createBlankLayer("World", tileset, 0, 0);
    const aboveLayer = this.map.createBlankLayer("Above Player", tileset, 0, 0);

    if (!belowLayer || !worldLayer || !aboveLayer) {
      console.error("Failed to create layers");
      return;
    }

    aboveLayer.setDepth(10);

    this.layers.set("Below Player", belowLayer);
    this.layers.set("World", worldLayer);
    this.layers.set("Above Player", aboveLayer);
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

    const tiles2D = [];
    for (let i = 0; i < 16; i++) {
      const row = tiles
        .slice(i * 16, (i + 1) * 16)
        .map((tile) => (tile === 0 ? -1 : tile));
      tiles2D.push(row);
    }

    layer.putTilesAt(tiles2D, x, y);
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

    this.nostrService.fetchChunkEvents(Array.from(chunksToKeep));
  }
}

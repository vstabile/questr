import Phaser from "phaser";
import { Player } from "../objects/Player";
import { ChunkManager } from "../systems/ChunkManager";
import { NostrProfile, NostrService } from "../services/NostrService";
import { AnimationManager } from "../utils/AnimationManager";
import { workerData } from "worker_threads";

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private chunkManager!: ChunkManager;
  private debugText!: Phaser.GameObjects.Text;
  private nostrService: NostrService;
  private locationInitialized: boolean = false;
  // Add variables to track position updates and timing
  private lastPublishedPosition: { x: number; y: number } = {
    x: 1400,
    y: 2400,
  };
  private positionUpdateTimer: Phaser.Time.TimerEvent | null = null;

  // Add a map to track other players
  private otherPlayers = new Map<string, { player: Player }>();

  constructor() {
    super({ key: "GameScene" });
    this.nostrService = NostrService.getInstance();
  }

  preload(): void {
    // Load the loading background image
    this.load.image("loading-bg", "assets/images/home.jpg");
    // Load the tilesets from TSX files
    // this.load.tilemapTiledJSON("tilemap", "assets/tilemaps/tuxemon-town.json");
    this.load.image("tiles", "assets/images/tuxmon-sample-32px-extruded.png");

    // Load player sprites
    this.load.atlas(
      "atlas",
      "assets/images/atlas.png",
      "assets/images/atlas.json"
    );
  }

  create(): void {
    // Create loading screen first
    const screenWidth = this.cameras.main.width;
    const screenHeight = this.cameras.main.height;

    const loadingScreen = this.add.container(screenWidth / 2, screenHeight / 2);

    // Add background
    const bg = this.add
      .image(-screenWidth / 2, -screenHeight / 2, "loading-bg")
      .setOrigin(0, 0)
      .setDisplaySize(this.cameras.main.width, this.cameras.main.height);

    // Add loading text
    const loadingText = this.add
      .text(0, 0, "Loading...", {
        font: "32px Arial",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // Add elements to container
    loadingScreen.add([bg, loadingText]);
    loadingScreen.setDepth(999999); // Ensure it's on top
    loadingScreen.setAlpha(1);

    // Create promises for initialization
    const locationPromise = new Promise<void>((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.locationInitialized) {
          clearInterval(checkInterval);
          setInterval(() => {
            resolve();
          }, 500);
        }
      }, 100);
    });

    // Get tileset configuration first
    const tilesetPromise = new Promise<void>((resolve) => {
      this.nostrService.fetchTilesetEvents();
      this.nostrService.addTilesetEventListener((event) => {
        try {
          const tags = event.tags;
          const name = tags.find((tag: string[]) => tag[0] === "name")?.[1];
          const firstgid = parseInt(
            tags.find((tag: string[]) => tag[0] === "firstgid")?.[1]
          );
          const margin = parseInt(
            tags.find((tag: string[]) => tag[0] === "margin")?.[1]
          );
          const spacing = parseInt(
            tags.find((tag: string[]) => tag[0] === "spacing")?.[1]
          );
          const tilewidth = parseInt(
            tags.find((tag: string[]) => tag[0] === "tilewidth")?.[1]
          );
          const tileheight = parseInt(
            tags.find((tag: string[]) => tag[0] === "tileheight")?.[1]
          );

          // Parse tile properties from event content
          const tileProperties = JSON.parse(event.content);

          // Initialize ChunkManager with tileset config including tile properties
          this.chunkManager = new ChunkManager(
            this,
            32, // tile size
            this.player,
            {
              name,
              imageKey: "tiles", // from preload
              tileWidth: tilewidth,
              tileHeight: tileheight,
              margin,
              spacing,
              firstgid,
              tileProperties, // Pass the tile properties
            }
          );

          resolve();
        } catch (error) {
          console.error("Error handling tileset event:", error);
          resolve(); // Resolve anyway to not block the game
        }
      });
    });

    // Wait for all conditions
    Promise.all([locationPromise, tilesetPromise]).then(() => {
      // Set up camera to follow player
      this.cameras.main.startFollow(this.player);
      this.cameras.main.setZoom(1);

      loadingScreen.destroy();
    });

    // Subscribe to location and tileset events
    this.nostrService.addLocationEventListener(
      this.handleLocationEvent.bind(this)
    );

    // Add debug text to show current position and errors
    this.debugText = this.add.text(10, 10, "", {
      font: "16px Arial",
      color: "#ffffff",
      backgroundColor: "#000000",
    });
    this.debugText.setScrollFactor(0); // Fix to camera
    this.debugText.setDepth(999998);
    this.debugText.setVisible(true);

    try {
      // Create player at the center of the screen
      const centerX = 1400;
      const centerY = 2400;

      // Get user data from Nostr service
      const profile = this.nostrService.getProfile();

      let playerName = "Anonymous";
      if (profile && (profile.displayName || profile.name)) {
        playerName = profile.displayName || profile.name || "Anonymous";
      }

      // Create the player with the name
      this.player = new Player(this, centerX, centerY, playerName);

      // Add player to the scene
      this.add.existing(this.player);

      // Update debug text with player position
      this.events.on("update", () => {
        if (this.player && this.chunkManager) {
          const { x, y } = this.player;
          const chunkCoords = this.chunkManager.getChunkCoordFromPosition(x, y);
          this.debugText.setText(
            `Position: (${Math.floor(x)}, ${Math.floor(y)})\n` +
              `Tile: (${Math.floor(x / 32)}, ${Math.floor(y / 32)})\n` +
              `Chunk: (${chunkCoords.chunkX}, ${chunkCoords.chunkY})`
          );
        }
      });

      // Fetch all existing location events to initialize other players
      this.nostrService.fetchAllLocationEvents();

      // Set up position update timer to publish Nostr events
      this.lastPublishedPosition = {
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
      };

      // Create a timer that fires every second
      this.positionUpdateTimer = this.time.addEvent({
        delay: 1000, // 1 second
        callback: this.publishPlayerPosition,
        callbackScope: this,
        loop: true,
      });

      // Set up a map to track other players
      this.otherPlayers = new Map();

      // Create animations once for all players
      AnimationManager.createPlayerAnimations(this);
    } catch (error) {
      const errorMsg = `Error in create method: ${error}`;
      console.error(errorMsg);
    }

    // Set up keyboard controls
    this.cursors = this.input.keyboard!.createCursorKeys();

    // Add space key for slicing
    this.spaceKey = this.input.keyboard!.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE
    );

    this.nostrService.addProfileListener(this.handleProfileUpdate.bind(this));
  }

  // Add a new method to publish player position
  private publishPlayerPosition(): void {
    if (!this.player) return;

    // Get current position and round to integers
    const currentX = Math.round(this.player.x);
    const currentY = Math.round(this.player.y);

    // Check if position has changed since last published event
    if (
      currentX !== this.lastPublishedPosition.x ||
      currentY !== this.lastPublishedPosition.y
    ) {
      // Update the last published position
      this.lastPublishedPosition = { x: currentX, y: currentY };

      // Get the user's pubkey
      const pubkey = this.nostrService.getPubkey();
      if (!pubkey) {
        console.error("Cannot publish event: No pubkey available");
        return;
      }

      // Format the 'a' tag correctly: <kind>:<pubkey>:<d-tag>
      const aTagValue = `31111:${pubkey}:test`;

      // Publish Nostr event with kind 31111
      try {
        this.nostrService.publishEvent({
          kind: 31111,
          tags: [
            ["a", aTagValue],
            ["d", "test"],
            ["x", currentX.toString()],
            ["y", currentY.toString()],
          ],
          content: "",
        });
      } catch (error) {
        console.error("Failed to publish Nostr event:", error);
      }
    }
  }

  // Add a method to handle location events from other players
  private handleLocationEvent(event: any): void {
    try {
      // Extract pubkey from the event
      const pubkey = event.pubkey;

      // Extract x and y coordinates from tags
      const xTag = event.tags.find((tag: string[]) => tag[0] === "x");
      const yTag = event.tags.find((tag: string[]) => tag[0] === "y");

      if (!xTag || !yTag) return;

      const x = parseInt(xTag[1]);
      const y = parseInt(yTag[1]);

      if (pubkey === this.nostrService.getPubkey()) {
        if (this.locationInitialized) return;
        // Update our own player position
        this.player.positionAt(x, y);
        this.locationInitialized = true;
      } else {
        // Update or create other player sprite
        this.updateOtherPlayerPosition(pubkey, x, y);
      }
    } catch (error) {
      console.error("Error handling location event:", error);
    }
  }

  // Add a method to update other player positions
  private async updateOtherPlayerPosition(
    pubkey: string,
    x: number,
    y: number
  ): Promise<void> {
    if (!this.otherPlayers.has(pubkey)) {
      // Get profile info
      const profile = this.nostrService.getProfileByPubkey(pubkey);
      const name = profile?.name || profile?.displayName || "Unknown";

      // Create a new player container with the name
      const otherPlayer = new Player(this, x, y, name);
      this.add.existing(otherPlayer);

      // Store the player in the map (no need to store nameText separately)
      this.otherPlayers.set(pubkey, { player: otherPlayer });
    } else {
      // Update existing player position
      const otherPlayer = this.otherPlayers.get(pubkey);
      if (!otherPlayer) return;

      // Move the player container
      otherPlayer.player.moveToPosition(x, y);
    }
  }

  update(): void {
    if (this.chunkManager) {
      this.chunkManager.update();
    }

    // Make sure cursors has the space key
    if (this.cursors && !this.cursors.space) {
      this.cursors.space = this.spaceKey;
    }

    // Update player movement based on keyboard input
    this.player.update(this.cursors);
  }

  handleProfileUpdate(profile: NostrProfile | null): void {
    if (!profile) return;

    if (profile.pubkey === this.nostrService.getPubkey()) {
      this.player.setNameText(profile.name || profile.displayName || "Unknown");
      return;
    }

    const otherPlayer = this.otherPlayers.get(profile.pubkey);
    if (otherPlayer) {
      // Update the name using the new setName method
      otherPlayer.player.setNameText(
        profile.name || profile.displayName || "Unknown"
      );
    }
  }

  // Add cleanup in the scene's shutdown method
  shutdown(): void {
    // Remove the location event listener
    this.nostrService.removeLocationEventListener(
      this.handleLocationEvent.bind(this)
    );

    this.nostrService.removeProfileListener(
      this.handleProfileUpdate.bind(this)
    );

    // Clear the position update timer
    if (this.positionUpdateTimer) {
      this.positionUpdateTimer.destroy();
    }
  }
}

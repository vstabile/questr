import Phaser from "phaser";
import { GameScene } from "./scenes/GameScene";
import { TitleScene } from "./scenes/TitleScene";
import { NostrService } from "./services/NostrService";

// Initialize the Nostr service
const nostrService = NostrService.getInstance();

// Game configuration
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1024,
  height: 800,
  parent: "game-container",
  scene: [TitleScene, GameScene],
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  dom: {
    createContainer: true,
  },
};

// Initialize the game
const game = new Phaser.Game(config);

// Add event listener for when the window is closed
window.addEventListener("beforeunload", () => {
  // Clean up Nostr service
  nostrService.dispose();
});

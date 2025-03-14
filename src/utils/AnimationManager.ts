export class AnimationManager {
  // Keep track of which animations have been created
  private static createdAnimations: Set<string> = new Set();

  /**
   * Create player animations if they don't already exist
   * @param scene The scene to create animations in
   */
  public static createPlayerAnimations(scene: Phaser.Scene): void {
    // Check if we've already created these animations
    if (this.createdAnimations.has("player")) {
      return;
    }

    scene.anims.create({
      key: "misa-left-walk",
      frames: scene.anims.generateFrameNames("atlas", {
        prefix: "misa-left-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    scene.anims.create({
      key: "misa-right-walk",
      frames: scene.anims.generateFrameNames("atlas", {
        prefix: "misa-right-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    scene.anims.create({
      key: "misa-front-walk",
      frames: scene.anims.generateFrameNames("atlas", {
        prefix: "misa-front-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });
    scene.anims.create({
      key: "misa-back-walk",
      frames: scene.anims.generateFrameNames("atlas", {
        prefix: "misa-back-walk.",
        start: 0,
        end: 3,
        zeroPad: 3,
      }),
      frameRate: 10,
      repeat: -1,
    });

    // Mark these animations as created
    this.createdAnimations.add("player");
  }
}

import Phaser from "phaser";
import { AnimationManager } from "../utils/AnimationManager";

export class Player extends Phaser.GameObjects.Container {
  private speed: number = 200;
  public body!: Phaser.Physics.Arcade.Body;
  private direction: string = "down";
  private lastNonDiagonalDirection: string = "down";

  // The sprite and nameText are now properties of the container
  private sprite: Phaser.GameObjects.Sprite;
  private nameText: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    name: string = "Anonymous"
  ) {
    // Create the container at the specified position
    super(scene, x, y);

    // Make sure animations are created
    AnimationManager.createPlayerAnimations(scene);

    // Create the sprite at position 0,0 (relative to container)
    // this.sprite = scene.add.sprite(0, 0, "atlas", 0);
    this.sprite = scene.add.sprite(0, 0, "atlas", 0);
    this.sprite.setOrigin(0.5, 0.5);
    this.setSize(30, 40);

    // Create the name text above the sprite
    this.nameText = scene.add.text(0, -30, name, {
      fontFamily: "Arial",
      fontSize: "12px",
      color: "#00ff00",
      stroke: "#000000",
      strokeThickness: 2,
      align: "center",
    });
    this.nameText.setOrigin(0.5);

    // Add both to the container
    this.add([this.sprite, this.nameText]);

    // Set the container's depth
    this.setDepth(1);

    // Enable physics on the container
    scene.physics.world.enable(this);

    // Set the physics body size to match the sprite
    // this.body.setSize(30, 40);
    this.body.setOffset(0, 12);
  }

  // Update the name text
  public setNameText(name: string): void {
    this.nameText.setText(name);
  }

  // Position the player at a specific location
  positionAt(x: number, y: number): void {
    this.x = x;
    this.y = y;
    // No need to update nameText as it's part of the container
  }

  /**
   * Move the player gradually to a new position with walking animation
   * @param x Target x position
   * @param y Target y position
   * @param speed Optional speed override (defaults to this.speed)
   */
  moveToPosition(x: number, y: number, speed?: number): void {
    // Stop any existing movement
    if (this.scene.tweens.isTweening(this)) {
      this.scene.tweens.killTweensOf(this);
    }

    // Calculate distance and direction
    const dx = x - this.x;
    const dy = y - this.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Determine direction for animation
    if (Math.abs(dx) > Math.abs(dy)) {
      // Moving horizontally
      this.direction = dx > 0 ? "right" : "left";
      this.lastNonDiagonalDirection = this.direction;
      this.sprite.play(`misa-${this.direction}-walk`, true);
    } else {
      // Moving vertically
      this.direction = dy > 0 ? "front" : "back";
      this.lastNonDiagonalDirection = this.direction;
      this.sprite.play(`misa-${this.direction}-walk`, true);
    }

    // Calculate duration based on distance and speed
    const moveSpeed = speed || this.speed;
    const duration = (distance / moveSpeed) * 1000; // Convert to milliseconds

    // Create tween to move the container (which includes both sprite and nameText)
    this.scene.tweens.add({
      targets: this,
      x: x,
      y: y,
      duration: duration,
      ease: "Linear",
      onComplete: () => {
        // Play idle animation when movement completes
        this.sprite.stop();
        this.sprite.setTexture(
          "atlas",
          `misa-${this.lastNonDiagonalDirection}`
        );
      },
    });
  }

  update(cursors: Phaser.Types.Input.Keyboard.CursorKeys): void {
    // Reset velocity
    this.body.setVelocity(0);

    // Handle orthogonal movement
    let moving = false;
    let isDiagonal = false;

    // Track horizontal and vertical movement separately
    let movingHorizontal = false;
    let movingVertical = false;

    // Handle horizontal movement
    if (cursors.left.isDown) {
      this.body.setVelocityX(-this.speed);
      movingHorizontal = true;
      moving = true;

      // Only update direction if not moving diagonally or if this is the first movement
      if (!cursors.up.isDown && !cursors.down.isDown) {
        this.direction = "left";
        this.lastNonDiagonalDirection = "left";
      }
    } else if (cursors.right.isDown) {
      this.body.setVelocityX(this.speed);
      movingHorizontal = true;
      moving = true;

      // Only update direction if not moving diagonally or if this is the first movement
      if (!cursors.up.isDown && !cursors.down.isDown) {
        this.direction = "right";
        this.lastNonDiagonalDirection = "right";
      }
    }

    // Handle vertical movement
    if (cursors.up.isDown) {
      this.body.setVelocityY(-this.speed);
      movingVertical = true;
      moving = true;

      // Only update direction if not moving horizontally or if this is the first movement
      if (!cursors.left.isDown && !cursors.right.isDown) {
        this.direction = "back";
        this.lastNonDiagonalDirection = "back";
      }
    } else if (cursors.down.isDown) {
      this.body.setVelocityY(this.speed);
      movingVertical = true;
      moving = true;

      // Only update direction if not moving horizontally or if this is the first movement
      if (!cursors.left.isDown && !cursors.right.isDown) {
        this.direction = "front";
        this.lastNonDiagonalDirection = "front";
      }
    }

    // Check if movement is diagonal
    isDiagonal = movingHorizontal && movingVertical;

    // If moving diagonally, use the last non-diagonal direction for animation
    if (isDiagonal) {
      this.direction = this.lastNonDiagonalDirection;
    }

    // Normalize velocity for diagonal movement to prevent faster diagonal speed
    if (moving && this.body.velocity.x !== 0 && this.body.velocity.y !== 0) {
      this.body.velocity.normalize().scale(this.speed);
    }

    // Play the appropriate animation based on movement and direction
    if (moving) {
      switch (this.direction) {
        case "left":
          this.sprite.setFlipX(true);
          this.sprite.play("misa-left-walk", true);
          break;
        case "right":
          this.sprite.setFlipX(false);
          this.sprite.play("misa-right-walk", true);
          break;
        case "back":
          this.sprite.play("misa-back-walk", true);
          break;
        case "front":
          this.sprite.play("misa-front-walk", true);
          break;
      }
    } else {
      // Idle animations
      switch (this.direction) {
        case "left":
          this.sprite.setTexture("atlas", "misa-left");
          break;
        case "right":
          this.sprite.setTexture("atlas", "misa-right");
          break;
        case "back":
          this.sprite.setTexture("atlas", "misa-back");
          break;
        case "front":
          this.sprite.setTexture("atlas", "misa-front");
          break;
      }
    }
  }
}

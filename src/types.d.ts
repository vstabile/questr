declare module "*.png" {
  const content: string;
  export default content;
}

declare namespace Phaser {
  namespace GameObjects {
    interface GameObjectFactory {
      existing(
        gameObject: Phaser.GameObjects.GameObject
      ): Phaser.GameObjects.GameObject;
    }
  }
}

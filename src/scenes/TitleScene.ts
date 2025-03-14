import Phaser from "phaser";
import { NostrService, NostrProfile } from "../services/NostrService";

// Define the Nostr window extension for TypeScript
declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
    };
  }
}

export class TitleScene extends Phaser.Scene {
  private connectButton!: Phaser.GameObjects.Text;
  private nsecLoginButton!: Phaser.GameObjects.Text;
  private nsecInputContainer!: Phaser.GameObjects.Container;
  private nsecInputField!: Phaser.GameObjects.DOMElement;
  private nsecSubmitButton!: Phaser.GameObjects.Text;
  private nsecCancelButton!: Phaser.GameObjects.Text;

  private nostrService: NostrService;
  private isLoading: boolean = false;

  constructor() {
    super({ key: "TitleScene" });
    this.nostrService = NostrService.getInstance();
  }

  preload(): void {
    // Load the background image
    this.load.image("background", "assets/images/home.jpg");

    // Create a circular default profile image
    const graphics = this.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x4287f5);
    graphics.fillCircle(64, 64, 64);
    graphics.generateTexture("default-profile", 128, 128);
  }

  create(): void {
    // Add background image and scale it to fit the screen
    const bg = this.add.image(0, 0, "background");
    bg.setOrigin(0, 0);

    // Scale the background to cover the screen while maintaining aspect ratio
    const scaleX = this.cameras.main.width / bg.width;
    const scaleY = this.cameras.main.height / bg.height;
    const scale = Math.max(scaleX, scaleY);
    bg.setScale(scale);

    // Center the background if it's larger than the screen
    bg.x = (this.cameras.main.width - bg.width * scale) / 2;
    bg.y = (this.cameras.main.height - bg.height * scale) / 2;

    // Add connect button
    const buttonBg = this.add.rectangle(
      this.cameras.main.width / 2,
      500,
      300, // width
      80, // height
      0x0f3460
    );
    buttonBg.setStrokeStyle(4, 0x572109);

    this.connectButton = this.add.text(
      this.cameras.main.width / 2,
      500,
      "Connect with NIP-07",
      {
        fontFamily: "Arial",
        fontSize: "24px",
        color: "#fcc55b",
        padding: { left: 40, right: 40, top: 20, bottom: 20 },
        stroke: "#572109",
        strokeThickness: 6,
      }
    );
    this.connectButton.setOrigin(0.5);
    buttonBg.setInteractive({ useHandCursor: true });
    this.connectButton.setInteractive({ useHandCursor: true });

    // Link both elements' events
    this.connectButton.on("pointerdown", () => this.connectNostr());
    this.connectButton.on("pointerover", () => {
      buttonBg.fillColor = 0x3946a6;
      this.connectButton.setStyle({
        color: "#f4ac61",
      });
      buttonBg.setStrokeStyle(4, 0x783109); // Slightly lighter border on hover
    });
    this.connectButton.on("pointerout", () => {
      buttonBg.fillColor = 0x0f3460;
      this.connectButton.setStyle({
        color: "#fcc55b",
      });
      buttonBg.setStrokeStyle(4, 0x572109);
    });

    // Add nsec login button
    const nsecButtonBg = this.add.rectangle(
      this.cameras.main.width / 2,
      580,
      300, // width
      40, // height
      0x0f3460
    );
    nsecButtonBg.setStrokeStyle(4, 0x572109);

    this.nsecLoginButton = this.add.text(
      this.cameras.main.width / 2,
      580,
      "Insert an nsec",
      {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#fcc55b",
        stroke: "#572109",
        strokeThickness: 4,
        padding: { left: 90, right: 90, top: 8, bottom: 8 },
      }
    );
    this.nsecLoginButton.setOrigin(0.5);
    this.nsecLoginButton.setInteractive({ useHandCursor: true });
    this.nsecLoginButton.on("pointerdown", () => this.showNsecInput());
    this.nsecLoginButton.on("pointerover", () => {
      nsecButtonBg.fillColor = 0x3946a6;
      this.nsecLoginButton.setStyle({ color: "#f4ac61" });
      nsecButtonBg.setStrokeStyle(4, 0x783109);
    });
    this.nsecLoginButton.on("pointerout", () => {
      nsecButtonBg.fillColor = 0x0f3460;
      this.nsecLoginButton.setStyle({ color: "#fcc55b" });
      nsecButtonBg.setStrokeStyle(4, 0x572109);
    });

    // Create nsec input container (initially hidden)
    this.nsecInputContainer = this.add.container(
      this.cameras.main.width / 2,
      500
    );
    this.nsecInputContainer.setVisible(false);

    // Add background for nsec input
    const inputBg = this.add.rectangle(0, 0, 500, 200, 0x333366);
    inputBg.setOrigin(0.5);
    inputBg.setStrokeStyle(2, 0x4287f5);

    // Add title for nsec input
    const inputTitle = this.add.text(0, -65, "Enter your nsec key", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
    });
    inputTitle.setOrigin(0.5);

    // Add warning text
    const warningText = this.add.text(
      0,
      75,
      "Warning: Only use this for testing purposes!",
      {
        fontFamily: "Arial",
        fontSize: "14px",
        color: "#fcc55b",
      }
    );
    warningText.setOrigin(0.5);

    // Create HTML input element for nsec
    const inputElement = document.createElement("input");
    inputElement.type = "text";
    inputElement.placeholder = "nsec1...";
    inputElement.style.width = "400px";
    inputElement.style.padding = "10px";
    inputElement.style.borderRadius = "4px";
    inputElement.style.border = "none";
    inputElement.style.fontSize = "16px";
    inputElement.name = "nsecInput"; // Add a name to reference it later

    this.nsecInputField = this.add.dom(0, -20, inputElement);
    this.nsecInputField.setOrigin(0.5);

    // Set the position and make sure it's visible
    this.nsecInputField.setVisible(true);

    // Add to the container
    this.nsecInputContainer.add([
      inputBg,
      inputTitle,
      this.nsecInputField,
      warningText,
    ]);

    // Add submit button
    this.nsecSubmitButton = this.add.text(80, 35, "Start", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#572109",
      backgroundColor: "#fdb636",
      padding: { left: 15, right: 15, top: 8, bottom: 8 },
    });
    this.nsecSubmitButton.setOrigin(0.5);
    this.nsecSubmitButton.setInteractive({ useHandCursor: true });
    this.nsecSubmitButton.on("pointerdown", () => this.loginWithNsec());
    this.nsecSubmitButton.on("pointerover", () =>
      this.nsecSubmitButton.setStyle({ backgroundColor: "#ffdb8d" })
    );
    this.nsecSubmitButton.on("pointerout", () =>
      this.nsecSubmitButton.setStyle({ backgroundColor: "#fdb636" })
    );

    // Add cancel button
    this.nsecCancelButton = this.add.text(-80, 35, "Cancel", {
      fontFamily: "Arial",
      fontSize: "18px",
      color: "#ffffff",
      backgroundColor: "#666666",
      padding: { left: 15, right: 15, top: 8, bottom: 8 },
    });
    this.nsecCancelButton.setOrigin(0.5);
    this.nsecCancelButton.setInteractive({ useHandCursor: true });
    this.nsecCancelButton.on("pointerdown", () => this.hideNsecInput());
    this.nsecCancelButton.on("pointerover", () =>
      this.nsecCancelButton.setStyle({ backgroundColor: "#888888" })
    );
    this.nsecCancelButton.on("pointerout", () =>
      this.nsecCancelButton.setStyle({ backgroundColor: "#666666" })
    );

    // Add elements to nsec input container
    this.nsecInputContainer.add([this.nsecSubmitButton, this.nsecCancelButton]);

    // Check if already connected
    if (this.nostrService.isNostrConnected()) {
      this.startGame();
    }
  }

  showNsecInput(): void {
    // Hide the login buttons
    this.connectButton.setVisible(false);
    this.nsecLoginButton.setVisible(false);

    // Show the nsec input container
    this.nsecInputContainer.setVisible(true);
  }

  hideNsecInput(): void {
    // Show the login buttons
    this.connectButton.setVisible(true);
    this.nsecLoginButton.setVisible(true);

    // Hide the nsec input container
    this.nsecInputContainer.setVisible(false);

    // Clear the input field
    const inputElement = this.nsecInputField.getChildByName(
      "input"
    ) as HTMLInputElement;
    if (inputElement) {
      inputElement.value = "";
    }
  }

  async loginWithNsec(): Promise<void> {
    if (this.isLoading) return;
    this.isLoading = true;

    try {
      const inputValue = (this.nsecInputField.node as HTMLInputElement).value;

      // Check if the element exists and has a value
      const nsec = inputValue && inputValue ? inputValue.trim() : "";

      console.log("NSEC value:", nsec);

      if (!nsec) {
        console.error("No nsec provided");
        return;
      }

      // Connect with the nsec
      const pubkey = await this.nostrService.connectWithNsec(nsec);

      if (pubkey) {
        // Hide the nsec input
        this.nsecInputContainer.setVisible(false);

        // Update UI for connected state
        this.startGame();

        // Clear the input field for security
        (this.nsecInputField.node as HTMLInputElement).value = "";
      } else {
        console.error("Failed to connect with nsec");
      }
    } catch (error) {
      console.error("Error connecting with nsec:", error);
    } finally {
      this.isLoading = false;
    }
  }

  async connectNostr(): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;

    try {
      const pubkey = await this.nostrService.connect();

      if (pubkey) {
        this.startGame();
      } else {
        console.error("Failed to connect to Nostr");
      }
    } catch (error) {
      console.error("Error connecting to Nostr:", error);
    } finally {
      this.isLoading = false;
    }
  }

  startGame(): void {
    // Start the game scene
    this.scene.start("GameScene");
  }
}

import {
  createRxNostr,
  RxNostr,
  createRxOneshotReq,
  uniq,
  createRxForwardReq,
  latest,
  filterByType,
} from "rx-nostr";
import { verifier } from "rx-nostr-crypto";
import { filter } from "rxjs";
import { EventStore } from "applesauce-core";
import { getPublicKey, finalizeEvent, nip19 } from "nostr-tools";

export interface NostrProfile {
  pubkey: string;
  name?: string;
  displayName?: string;
  picture?: string;
  about?: string;
  nip05?: string;
}

export class NostrService {
  private static instance: NostrService;
  private rxNostr: RxNostr | null = null;
  private privateKey: Uint8Array | null = null;
  private pubkey: string | null = null;
  private profile: NostrProfile | null = null;
  private isConnected: boolean = false;
  private connectionListeners: ((pubkey: string | null) => void)[] = [];
  private profileListeners: ((profile: NostrProfile | null) => void)[] = [];
  private eventStore: EventStore;

  // Add a property to store followed pubkeys
  private followedPubkeys: string[] = [];

  // Add a property for location event listeners
  private locationEventListeners: ((event: any) => void)[] = [];

  // Add a property for chunk event listeners
  private chunkEventListeners: ((event: any) => void)[] = [];

  // Add a map to store profiles by pubkey
  private profilesByPubkey: Map<string, NostrProfile> = new Map();

  // Add a Set to track processed event IDs at the class level
  private processedEventIds: Set<string> = new Set();

  // Singleton pattern
  private constructor() {
    this.eventStore = new EventStore();

    // Initialize the service
    this.initialize();
  }

  public static getInstance(): NostrService {
    if (!NostrService.instance) {
      NostrService.instance = new NostrService();
    }
    return NostrService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Create rx-nostr instance
      this.rxNostr = createRxNostr({ verifier });

      // Connect to multiple relays for redundancy
      this.rxNostr.setDefaultRelays([
        // "ws://localhost:8080",
        "wss://relay.damus.io",
        "wss://nos.lol",
        "wss://relay.nostr.band",
        "wss://nostr-pub.wellorder.net",
        "wss://relay.snort.social",
      ]);

      const rxReq = createRxForwardReq();

      // Define a listener.
      this.rxNostr.use(rxReq).subscribe(({ event }) => {
        console.log("Added", event);
        this.eventStore.add(event);
      });

      // Set up periodic cleanup of old event IDs
      setInterval(() => {
        this.processedEventIds.clear();
      }, 60000); // Run every minute (60000 ms)

      console.log("NostrService initialized");
    } catch (error) {
      console.error("Failed to initialize NostrService:", error);
    }
  }

  public async connect(): Promise<string | null> {
    if (!this.privateKey && !window.nostr) {
      console.error("No Nostr extension found");
      return null;
    }

    try {
      if (!this.privateKey) {
        // Get public key using NIP-07
        this.pubkey = await window.nostr!.getPublicKey();
      } else {
        this.pubkey = getPublicKey(this.privateKey);
      }

      if (this.pubkey) {
        this.isConnected = true;
        this.notifyConnectionListeners();

        // Fetch profile data
        await this.fetchProfile();

        // Fetch follow list
        await this.fetchFollowList();

        // Subscribe to location events from followed users
        this.subscribeToFollowedUsersLocations();

        return this.pubkey;
      }
      return null;
    } catch (error) {
      console.error("Error connecting to Nostr:", error);
      return null;
    }
  }

  private async fetchProfile(): Promise<void> {
    if (!this.rxNostr || !this.pubkey) return;

    try {
      // Create a request for kind 0 (metadata) events
      const req = createRxOneshotReq({
        filters: [{ kinds: [0], authors: [this.pubkey] }],
      });

      // Subscribe to events
      this.rxNostr
        .use(req)
        .pipe(
          filter(
            (packet) => packet.type === "EVENT" && packet.event?.kind === 0
          ),
          uniq(),
          latest()
        )
        .subscribe({
          next: (packet) => {
            if (packet.type === "EVENT" && packet.event?.kind === 0) {
              try {
                // Parse the content as JSON
                const content = JSON.parse(packet.event.content);
                this.profile = content as NostrProfile;
                this.profile.pubkey = this.pubkey!;

                this.notifyProfileListeners(this.profile);
              } catch (error) {
                console.error("Error parsing profile:", error);
              }
            }
          },
          error: (error) => {
            console.error("Error fetching profile:", error);
          },
        });
    } catch (error) {
      console.error("Error in fetchProfile:", error);
    }
  }

  // Add method to fetch follow list
  private async fetchFollowList(): Promise<void> {
    if (!this.rxNostr || !this.pubkey) return;

    try {
      console.log("Fetching follow list for pubkey:", this.pubkey);

      // Create a request for kind 3 (contacts/following) events
      const req = createRxOneshotReq({
        filters: [{ kinds: [3], authors: [this.pubkey] }],
      });

      // Subscribe to events
      this.rxNostr
        .use(req)
        .pipe(
          filter(
            (packet) => packet.type === "EVENT" && packet.event?.kind === 3
          ),
          uniq(),
          latest()
        )
        .subscribe({
          next: (packet) => {
            if (packet.type === "EVENT" && packet.event?.kind === 3) {
              try {
                // Extract pubkeys from the p tags
                const followList = packet.event.tags
                  .filter((tag) => tag[0] === "p")
                  .map((tag) => tag[1]);

                this.followedPubkeys = followList;
                console.log(`Fetched ${followList.length} followed pubkeys`);

                // After getting the follow list, subscribe to their location events
                this.subscribeToFollowedUsersLocations();
              } catch (error) {
                console.error("Error processing follow list:", error);
              }
            }
          },
          error: (error) => {
            console.error("Error fetching follow list:", error);
          },
        });
    } catch (error) {
      console.error("Error in fetchFollowList:", error);
    }
  }

  // Add method to subscribe to location events from followed users
  private subscribeToFollowedUsersLocations(): void {
    if (!this.rxNostr) return;

    try {
      console.log("Subscribing to location events from followed users");

      const req = createRxForwardReq();

      this.rxNostr
        .use(req)
        .pipe(filterByType("EVENT"), uniq(), latest())
        .subscribe(({ event }) => {
          if (event?.kind === 31111) {
            // Check if we've already processed this event
            if (this.processedEventIds.has(event.id)) {
              console.log("Skipping duplicate event:", event.id);
              return;
            }

            // Add the event ID to our processed set
            this.processedEventIds.add(event.id);

            this.notifyLocationEventListeners(event);
          }
        });

      // For testing, subscribe to all location events
      req.emit({
        kinds: [31111],
        // authors: this.followedPubkeys,
        "#d": ["test"],
      });
    } catch (error) {
      console.error("Error in subscribeToFollowedUsersLocations:", error);
    }
  }

  // Add methods to manage location event listeners
  public addLocationEventListener(listener: (event: any) => void): void {
    this.locationEventListeners.push(listener);
  }

  public addChunkEventListener(listener: (event: any) => void): void {
    this.chunkEventListeners.push(listener);
  }

  public removeLocationEventListener(listener: (event: any) => void): void {
    this.locationEventListeners = this.locationEventListeners.filter(
      (l) => l !== listener
    );
  }

  public removeChunkEventListener(listener: (event: any) => void): void {
    this.chunkEventListeners = this.chunkEventListeners.filter(
      (l) => l !== listener
    );
  }

  private notifyLocationEventListeners(event: any): void {
    this.locationEventListeners.forEach((listener) => listener(event));
  }

  private notifyChunkEventListeners(event: any): void {
    this.chunkEventListeners.forEach((listener) => listener(event));
  }

  public getPubkey(): string | null {
    return this.pubkey;
  }

  public getProfile(): NostrProfile | null {
    return this.profile;
  }

  public isNostrConnected(): boolean {
    return this.isConnected;
  }

  public addConnectionListener(
    listener: (pubkey: string | null) => void
  ): void {
    this.connectionListeners.push(listener);
    // Immediately notify with current state
    listener(this.pubkey);
  }

  public removeConnectionListener(
    listener: (pubkey: string | null) => void
  ): void {
    this.connectionListeners = this.connectionListeners.filter(
      (l) => l !== listener
    );
  }

  public addProfileListener(
    listener: (profile: NostrProfile | null) => void
  ): void {
    this.profileListeners.push(listener);
  }

  public removeProfileListener(
    listener: (profile: NostrProfile | null) => void
  ): void {
    this.profileListeners = this.profileListeners.filter((l) => l !== listener);
  }

  private notifyConnectionListeners(): void {
    this.connectionListeners.forEach((listener) => listener(this.pubkey));
  }

  private notifyProfileListeners(profile: NostrProfile | null): void {
    this.profileListeners.forEach((listener) => listener(profile));
  }

  /**
   * Publishes a Nostr event
   * @param eventData Partial event data (kind, tags, content)
   * @returns Promise with the event ID if successful
   */
  public async publishEvent(eventData: {
    kind: number;
    tags: string[][];
    content: string;
  }): Promise<string> {
    try {
      if (!this.pubkey) {
        throw new Error("No pubkey available. User not authenticated.");
      }

      // Create the event object
      const event = {
        kind: eventData.kind,
        created_at: Math.floor(Date.now() / 1000),
        tags: eventData.tags,
        content: eventData.content,
        pubkey: this.pubkey,
      };

      // Sign the event (you'll need to implement this based on your authentication method)
      const signedEvent = await this.signEvent(event);

      // Publish to relays
      if (this.rxNostr) {
        this.rxNostr.send(signedEvent);
        return signedEvent.id;
      } else {
        throw new Error("Relay pool not initialized");
      }
    } catch (error) {
      console.error("Error publishing event:", error);
      throw error;
    }
  }

  // You'll also need a method to sign events
  private async signEvent(event: any): Promise<any> {
    // Implementation depends on how you're handling keys
    if (this.privateKey) {
      return finalizeEvent(event, this.privateKey);
    } else if (window.nostr) {
      return await window.nostr.signEvent(event);
    }

    // If using a different signing method, implement it here
    throw new Error("Event signing not implemented");
  }

  // Clean up resources when the game is closed
  public dispose(): void {
    if (this.rxNostr) {
      this.rxNostr.dispose();
      this.rxNostr = null;
    }
    this.isConnected = false;
    this.pubkey = null;
    this.profile = null;
  }

  // Add this method to fetch and get profiles by pubkey
  public getProfileByPubkey(pubkey: string): NostrProfile | null {
    // Return from cache if available
    if (this.profilesByPubkey.has(pubkey)) {
      return this.profilesByPubkey.get(pubkey) || null;
    }

    // Otherwise fetch the profile
    if (!this.rxNostr) return null;

    try {
      // Create a request for kind 0 (metadata) events
      const req = createRxOneshotReq({
        filters: [{ kinds: [0], authors: [pubkey] }],
      });

      // Subscribe to events
      this.rxNostr!.use(req)
        .pipe(
          filter(
            (packet) => packet.type === "EVENT" && packet.event?.kind === 0
          ),
          uniq(),
          latest()
        )
        .subscribe({
          next: (packet) => {
            if (packet.type === "EVENT" && packet.event?.kind === 0) {
              try {
                // Parse the content as JSON
                const content = JSON.parse(packet.event.content);
                const profile = content as NostrProfile;
                profile.pubkey = pubkey;

                // Cache the profile
                this.profilesByPubkey.set(pubkey, profile);

                this.notifyProfileListeners(profile);
              } catch (error) {
                console.error("Error parsing profile:", error);
              }
            }
          },
          error: (error) => {
            console.error("Error fetching profile:", error);
          },
        });

      return null;
    } catch (error) {
      console.error("Error in getProfileByPubkey:", error);
      return null;
    }
  }

  /**
   * Connect with an nsec private key
   * @param nsec The nsec private key
   * @returns Promise<boolean> Whether the connection was successful
   */
  public connectWithNsec(nsec: string): string | null {
    try {
      if (nsec.startsWith("nsec")) {
        try {
          const { type, data } = nip19.decode(nsec);
          if (type !== "nsec") {
            throw new Error("Invalid nsec format");
          }
          // Convert Uint8Array to hex string
          this.privateKey = data;
          this.connect();

          return getPublicKey(this.privateKey);
        } catch (error) {
          console.error("Error decoding nsec:", error);
          return null;
        }
      }

      return null;
    } catch (error) {
      console.error("Error connecting with nsec:", error);
      return null;
    }
  }

  /**
   * Fetches all existing location events and notifies listeners
   * Used to initialize the game with current player positions
   * @returns Promise that resolves when initial events are fetched
   */
  public async fetchAllLocationEvents(): Promise<void> {
    if (!this.rxNostr) {
      console.error("RxNostr not initialized");
      return;
    }

    try {
      console.log("Fetching all location events...");

      // Create a one-shot request for all kind 31111 events with d tag "test"
      const req = createRxOneshotReq({
        filters: [
          {
            kinds: [31111],
            "#d": ["test"],
          },
        ],
      });

      // Return a promise that resolves when events are fetched
      return new Promise((resolve) => {
        let eventCount = 0;

        // Subscribe to events
        this.rxNostr!.use(req)
          .pipe(
            filter(
              (packet) =>
                packet.type === "EVENT" && packet.event?.kind === 31111
            )
          )
          .subscribe({
            next: (packet) => {
              if (packet.type === "EVENT" && packet.event?.kind === 31111) {
                try {
                  const event = packet.event;

                  eventCount++;
                  this.notifyLocationEventListeners(event);
                } catch (error) {
                  console.error("Error processing location event:", error);
                }
              }
            },
            error: (error) => {
              console.error("Error fetching location events:", error);
              resolve(); // Resolve even on error to not block game loading
            },
            complete: () => {
              console.log(`Fetched ${eventCount} initial location events`);
              resolve(); // Resolve when complete
            },
          });
      });
    } catch (error) {
      console.error("Error in fetchAllLocationEvents:", error);
    }
  }

  public async fetchChunkEvents(chunks: string[]): Promise<void> {
    const chunkEventType = 31112;
    const layers = ["Below Player", "World", "Above Player"];

    if (!this.rxNostr) {
      console.error("RxNostr not initialized");
      return;
    }

    try {
      console.log("Fetching tilemap chunk events...");

      const req = createRxOneshotReq({
        filters: [
          {
            kinds: [chunkEventType],
            "#d": layers.flatMap((layer) =>
              chunks.map((chunk) => `test:${layer}:${chunk}`)
            ),
          },
        ],
      });

      // Return a promise that resolves when events are fetched
      return new Promise((resolve) => {
        let eventCount = 0;

        // Subscribe to events
        this.rxNostr!.use(req)
          .pipe(
            filter(
              (packet) =>
                packet.type === "EVENT" && packet.event?.kind === chunkEventType
            )
          )
          .subscribe({
            next: (packet) => {
              if (
                packet.type === "EVENT" &&
                packet.event?.kind === chunkEventType
              ) {
                try {
                  const event = packet.event;

                  eventCount++;
                  this.notifyChunkEventListeners(event);
                } catch (error) {
                  console.error("Error processing chunk event:", error);
                }
              }
            },
            error: (error) => {
              console.error("Error fetching chunk events:", error);
              resolve(); // Resolve even on error to not block game loading
            },
            complete: () => {
              console.log(`Fetched ${eventCount} chunk events`);
              resolve(); // Resolve when complete
            },
          });
      });
    } catch (error) {
      console.error("Error in fetchChunkEvents:", error);
    }
  }
}

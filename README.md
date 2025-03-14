# Questr - A Nostr MMORPG

A top-down orthogonal game built with Phaser 3 where you can move a character with your keyboard in an infinite, chunk-based world. The game integrates with Nostr to provide a personalized gaming experience.

## Features

- Top-down orthogonal game world
- Chunk-based infinite map system
- Keyboard controls for character movement
- Slicing action with space bar
- Smooth animations
- Nostr integration for player identity

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)

### Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm start
   ```
   or use the development mode with hot reloading:
   ```
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:8080`

## Controls

- Use the arrow keys to move the character in the game world
- Press the space bar to perform a slicing action in the direction you're facing

## Nostr Integration

Questr integrates with Nostr using NIP-07 to provide a personalized gaming experience:

1. **Authentication**: Connect with your Nostr public key using a NIP-07 compatible browser extension
2. **Profile Data**: Your Nostr profile is fetched and displayed in the game
3. **Location**: Your current location is shared as a Nostr event
4. **Map**: Loads chunks of the map as Nostr events (TODO)

The game implements:

- NIP-07 for authentication
- NIP-01 for fetching profile metadata
- NIP-XX for updating the player position on the map
- TODO: NIP-XX for loading chunks of the map as the player moves

## Development

- `npm start` - Start the development server
- `npm run dev` - Start the development server with hot reloading
- `npm run build` - Build the game for production

## Technical Details

### Chunk-Based Map System

The game uses a chunk-based map system to create an "infinite" world:

- The world is divided into chunks (16x16 tiles each)
- Only chunks near the player are loaded and rendered
- As the player moves, new chunks are dynamically loaded and distant chunks are unloaded
- This approach allows for an expansive world without performance issues

## License

This project is licensed under the MIT License - see the LICENSE file for details.

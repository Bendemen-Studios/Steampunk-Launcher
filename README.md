# Steampunk-Launcher

Steampunk SMP Minecraft launcher by Bendemen Studios.

## Features

- Microsoft Minecraft accounts stored locally on the player's device
- Multiple accounts with profile switching
- No shared account pool
- Dutch default language + English
- Era chooser:
  - Steamy Times
  - A New Era
- Completely separate Minecraft game directory per Era
- Local modpack ZIP installation
- Loader support through the Era manifest
- Minecraft Java launching with automatic game/Java dependency handling through `minecraft-java-core`
- Live server status
- Discord, Instagram and WhatsApp links
- Startup update screen with real `electron-updater` download progress
- Windows, macOS and Linux packaging configuration

## Account security

Microsoft authentication is handled in the desktop launcher. Account data is stored in the user's Electron data directory and encrypted with Electron `safeStorage` when the operating system provides it. No shared Bendemen account pool is used.

Desktop Microsoft authentication should use a public-client flow; desktop apps must not contain a client secret. Microsoft recommends authorization code + PKCE for native desktop apps. See Microsoft's identity guidance.

## Era structure

```text
content/
└── eras/
    ├── steamy-times/
    │   ├── mods/
    │   ├── config/
    │   ├── resourcepacks/
    │   ├── modpack.zip       # optional, added later
    │   └── modpack.json
    └── a-new-era/
        ├── mods/
        ├── config/
        ├── resourcepacks/
        ├── modpack.zip       # optional, added later
        └── modpack.json
```

### Era manifest

Example:

```json
{
  "id": "steamy-times",
  "name": "Steamy Times",
  "minecraftVersion": "1.21.1",
  "loader": "neoforge",
  "loaderBuild": "latest",
  "version": "1.0.0"
}
```

When a `modpack.zip` is present, the launcher extracts/copies its `mods`, `config` and `resourcepacks` folders into the selected Era.

## Configuration

Edit `config/launcher.json`:

- Minecraft server hostname and port
- Discord URL
- Instagram URL
- WhatsApp URL
- Default JVM memory

Do not put Microsoft credentials or client secrets in this file.

## Updates

The launcher uses electron-builder + electron-updater with GitHub Releases as the update provider. The startup screen exposes checking, download progress and installation state. Automatic updates require a packaged build and published release metadata; development runs intentionally skip the updater.

## Development

Requirements:

- Node.js 20+
- npm
- Electron

```bash
npm install
npm start
```

Build:

```bash
npm run dist
```

The CI workflow runs dependency installation and JavaScript syntax checks.

## Current status

Core launcher implementation is in place. The actual Steamy Times and A New Era modpack manifests still need their final Minecraft versions/loaders and modpack files.

# Steampunk-Launcher

A steampunk-themed Minecraft launcher for the Steampunk SMP.

## Planned features

- Multi Minecraft account support with local profile switching
- No shared account pool
- Dutch as the default language, with English available
- Era chooser for Steamy Times and A New Era
- Independent modpack/content folders per Era
- Minecraft launch flow
- Server status
- Discord, Instagram and WhatsApp social links
- Startup update screen with a visual loading/progress bar
- Cross-platform architecture prepared for Windows, macOS and Linux

## Content layout

```text
content/
└── eras/
    ├── steamy-times/
    │   ├── mods/
    │   ├── config/
    │   ├── resourcepacks/
    │   └── modpack.json
    └── a-new-era/
        ├── mods/
        ├── config/
        ├── resourcepacks/
        └── modpack.json
```

Modpacks can be added later without changing the launcher UI.

## Update flow

On startup the launcher checks its configured release/update endpoint, downloads required launcher updates, verifies the download, shows progress, and only then opens the main launcher window.

## Status

Initial architecture.

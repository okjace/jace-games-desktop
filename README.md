# Jace Games for desktop

The [Jace Games](https://jace-games.vercel.app) site as a desktop app for Windows, macOS and Linux,
built with Electron.

## Download

Get the latest from [Releases](https://github.com/okjace/jace-games-desktop/releases/latest):

| System | File | How to install |
| --- | --- | --- |
| Windows | `JaceGames-<version>-windows-x64.exe` | Run it and follow the setup wizard (choose a folder, desktop and Start menu shortcuts). No admin needed. Uninstall from Settings → Apps → Installed apps. |
| Mac (Apple Silicon) | `JaceGames-<version>-macos-arm64.dmg` | Open it and drag Jace Games to Applications. |
| Mac (Intel) | `JaceGames-<version>-macos-x64.dmg` | Same as above. |
| Linux | `JaceGames-<version>-x86_64.AppImage` | `chmod +x` it and run it. |
| Debian / Ubuntu | `JaceGames-<version>-amd64.deb` | `sudo apt install ./JaceGames-<version>-amd64.deb` |

**First launch on Mac:** the app isn't signed with an Apple developer certificate, so macOS may say it
"can't be opened". Right-click Jace Games in Applications → **Open** → **Open** (only needed once).
**Windows** may show "Windows protected your PC": click **More info → Run anyway**.

## What it does

- Shows jace-games.vercel.app in a native window with menus and keyboard shortcuts
- Jace pages (the site, Jace sign-in, Jace Social) stay in the app; other links open in your browser
- Keeps you signed in, remembers the window, shows an offline screen when there's no internet
- Updates from GitHub Releases (one click on Windows and AppImage; a download link on Mac and .deb)

## Develop

```bash
npm install
npm start            # run from source
npm run self-test    # start, render the offline screen, quit (what CI checks)
npm run dist         # build installers for this system into dist/
```

## Releasing

Bump `version` in `package.json`, add a `## <version>` section to `CHANGELOG.md`, and push to `main`.
GitHub Actions builds and tests Windows, macOS (Apple Silicon + Intel) and Linux, then publishes a
Release with the installers (and the update files the app reads). With a `JACE_STORE_TOKEN` secret it
also lists the release on Jace Store.

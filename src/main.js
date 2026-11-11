// Jace Games desktop app: the Jace Games site in a native window.
//
// - Jace pages (the site, Jace sign-in, Jace Social) stay in the app; every other
//   link opens in your normal browser.
// - Your sign-in and saved games are kept between launches (a persistent session).
// - No internet? A friendly offline screen with a Retry button.
// - Native menus and shortcuts, remembered window size, one copy of the app at a time.
// - Updates from GitHub Releases: one click on Windows and Linux (AppImage); on Mac
//   (unsigned) and the .deb, a "new version" prompt with a download link.
// - `--self-test` loads the offline screen and quits (used by CI on packaged builds).

const { app, BrowserWindow, Menu, shell, dialog, session, nativeTheme } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SITE = "https://jace-games.vercel.app";
const JACE_HOSTS = new Set(["jace-games.vercel.app", "jaceo.vercel.app", "jace-social.vercel.app"]);
const REPO = "okjace/jace-games-desktop";
const PARTITION = "persist:jacegames";
const SELF_TEST = process.argv.includes("--self-test");
const isMac = process.platform === "darwin";

let win = null;

// ---------- one copy at a time ----------

if (!SELF_TEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

// ---------- window size and position, remembered ----------

const stateFile = () => path.join(app.getPath("userData"), "window.json");

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch {
    /* first launch */
  }
  return { width: 1280, height: 820 };
}

function saveWindowState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {
    /* not important */
  }
}

// ---------- links: Jace pages stay in the app, everything else opens in the browser ----------

function isJace(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && JACE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

function openOutside(url) {
  try {
    const u = new URL(url);
    if (["https:", "http:", "mailto:"].includes(u.protocol)) shell.openExternal(url);
  } catch {
    /* ignore odd links */
  }
}

function guard(contents) {
  // Links that change the page: keep Jace in the app, send the rest to the browser.
  contents.on("will-navigate", (e, url) => {
    if (url.startsWith("file://") || isJace(url)) return;
    e.preventDefault();
    openOutside(url);
  });
  // New windows (target=_blank, window.open): Jace pages open in an app window
  // (e.g. "Play too" on the host screen); anything else opens in the browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (url === "about:blank" || isJace(url)) {
      return { action: "allow", overrideBrowserWindowOptions: windowOptions({ width: 1100, height: 760 }) };
    }
    openOutside(url);
    return { action: "deny" };
  });
  contents.on("did-create-window", (child) => guard(child.webContents));
  // A page that can't load (offline, server down): show the offline screen.
  contents.on("did-fail-load", (_e, code, _desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted, e.g. a new navigation */ || url.startsWith("file://")) return;
    contents.loadFile(path.join(__dirname, "offline.html"), { query: { retry: url || SITE } });
  });
}

function windowOptions(extra = {}) {
  return {
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#09090f" : "#ffffff",
    icon: path.join(__dirname, "..", "build", "icon.png"),
    autoHideMenuBar: !isMac,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
    ...extra,
  };
}

function go(where) {
  if (!win) return;
  win.loadURL(where.startsWith("http") ? where : SITE + where);
}

// ---------- the main window ----------

function createWindow() {
  const state = loadWindowState();
  win = new BrowserWindow(
    windowOptions({
      title: "Jace Games",
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y,
      minWidth: 640,
      minHeight: 480,
      show: false,
    }),
  );
  if (state.maximized) win.maximize();
  guard(win.webContents);
  win.once("ready-to-show", () => win.show());
  for (const ev of ["resize", "move", "close"]) win.on(ev, saveWindowState);
  win.on("closed", () => (win = null));

  if (SELF_TEST) {
    // CI: prove the packaged app starts and renders, then exit.
    const done = (ok, why) => {
      const line = ok ? "SELF-TEST OK" : `SELF-TEST FAILED: ${why}`;
      console.log(line);
      if (process.env.JACE_SELF_TEST_OUT) fs.writeFileSync(process.env.JACE_SELF_TEST_OUT, `${line}\nversion ${app.getVersion()}\n`);
      app.exit(ok ? 0 : 1);
    };
    const timer = setTimeout(() => done(false, "timed out"), 30_000);
    win.webContents.once("did-finish-load", async () => {
      clearTimeout(timer);
      const title = await win.webContents.executeJavaScript("document.title").catch(() => "");
      done(title.includes("Jace Games"), `unexpected page title ${JSON.stringify(title)}`);
    });
    win.loadFile(path.join(__dirname, "offline.html"), { query: { retry: SITE, test: "1" } });
    return;
  }
  win.loadURL(SITE);
}

// ---------- menus ----------

function buildMenu() {
  const nav = (label, where, accelerator) => ({ label, accelerator, click: () => go(where) });
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit", label: "Quit Jace Games" }],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
      ],
    },
    {
      label: "Go",
      submenu: [
        { label: "Back", accelerator: isMac ? "Cmd+[" : "Alt+Left", click: () => win?.webContents.navigationHistory.goBack() },
        { label: "Forward", accelerator: isMac ? "Cmd+]" : "Alt+Right", click: () => win?.webContents.navigationHistory.goForward() },
        { type: "separator" },
        nav("Home", "/", "CmdOrCtrl+Shift+H"),
        nav("Games", "/games", "CmdOrCtrl+1"),
        nav("Live", "/live", "CmdOrCtrl+2"),
        nav("Join a live game", "/live/games", "CmdOrCtrl+3"),
        nav("Studio", "/studio", "CmdOrCtrl+4"),
        nav("Leaderboards", "/leaderboards", "CmdOrCtrl+5"),
        { type: "separator" },
        nav("Profile", "/profile"),
        nav("Locker", "/locker"),
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Check for Updates…", click: () => checkForUpdates(true) },
        { label: "Open Jace Games in Your Browser", click: () => shell.openExternal(win?.webContents.getURL().startsWith("http") ? win.webContents.getURL() : SITE) },
        { label: "Report a Problem", click: () => shell.openExternal(`https://github.com/${REPO}/issues`) },
        { type: "separator" },
        {
          label: `About Jace Games ${app.getVersion()}`,
          click: () =>
            dialog.showMessageBox(win, {
              type: "info",
              title: "About Jace Games",
              message: `Jace Games ${app.getVersion()}`,
              detail: `Electron ${process.versions.electron}\nby jace.deb\n${SITE}`,
              icon: path.join(__dirname, "..", "build", "icon.png"),
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- updates ----------

/** Can this copy update itself? (Windows installer and AppImage can; unsigned Mac apps and .deb can't.) */
function canSelfUpdate() {
  if (!app.isPackaged) return false;
  if (process.platform === "win32") return true;
  if (process.platform === "linux") return !!process.env.APPIMAGE;
  return false;
}

const newer = (a, b) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
};

async function checkForUpdates(fromMenu = false) {
  if (!app.isPackaged) {
    if (fromMenu) dialog.showMessageBox(win, { message: "Updates work in the installed app, not when running from source." });
    return;
  }
  if (canSelfUpdate()) {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.removeAllListeners();
    autoUpdater.on("update-downloaded", async (info) => {
      const r = await dialog.showMessageBox(win, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        message: `Jace Games ${info.version} is ready`,
        detail: "Restart to finish updating. (If you choose Later, it updates the next time you quit.)",
      });
      if (r.response === 0) autoUpdater.quitAndInstall();
    });
    if (fromMenu) {
      autoUpdater.once("update-not-available", () => dialog.showMessageBox(win, { message: `You're up to date (${app.getVersion()}).` }));
      autoUpdater.once("error", (err) => dialog.showMessageBox(win, { type: "warning", message: "Couldn't check for updates.", detail: String(err?.message ?? err) }));
    }
    autoUpdater.checkForUpdates().catch(() => {});
    return;
  }
  // Mac (unsigned) and .deb: tell people about a new version and link the download.
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) throw new Error(`GitHub said ${res.status}`);
    const rel = await res.json();
    const latest = String(rel.tag_name || "").replace(/^v/, "");
    if (latest && newer(latest, app.getVersion())) {
      const r = await dialog.showMessageBox(win, {
        type: "info",
        buttons: ["Download", "Later"],
        defaultId: 0,
        message: `Jace Games ${latest} is out`,
        detail: `You have ${app.getVersion()}. Download the new version and install it over this one.`,
      });
      if (r.response === 0) shell.openExternal(rel.html_url || `https://github.com/${REPO}/releases/latest`);
    } else if (fromMenu) {
      dialog.showMessageBox(win, { message: `You're up to date (${app.getVersion()}).` });
    }
  } catch (err) {
    if (fromMenu) dialog.showMessageBox(win, { type: "warning", message: "Couldn't check for updates.", detail: String(err?.message ?? err) });
  }
}

// ---------- start ----------

app.whenReady().then(() => {
  app.setName("Jace Games");
  if (process.platform === "win32") app.setAppUserModelId("io.github.okjace.JaceGames");

  const ses = session.fromPartition(PARTITION);
  // Let the site know it's the app (e.g. to hide "get the app" prompts later).
  ses.setUserAgent(`${ses.getUserAgent()} JaceGamesDesktop/${app.getVersion()}`);
  // Only what the games need: notifications, fullscreen, clipboard. No camera, mic or location.
  const allowed = new Set(["notifications", "fullscreen", "clipboard-sanitized-write", "clipboard-read", "pointerLock"]);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));

  buildMenu();
  createWindow();
  if (!SELF_TEST) {
    setTimeout(() => checkForUpdates(false), 5_000);
    setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (!isMac || SELF_TEST) app.quit();
});

// Never let any page turn into something other than a web page (no file:// except our offline screen).
app.on("web-contents-created", (_e, contents) => {
  contents.on("will-attach-webview", (e) => e.preventDefault());
});

# Building the standalone Windows app (.msi / .exe)

Tauri builds the native app on the platform you're targeting, so a Windows
installer is built **on Windows**, not cross-compiled from WSL. The repo is
already configured (icons + bundling enabled); these are the host-setup steps.

## 1. Install prerequisites (one time, on Windows)

1. **Visual Studio C++ Build Tools** — the MSVC compiler/linker Rust needs.
   Install "Build Tools for Visual Studio" and check the
   **"Desktop development with C++"** workload.
   <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
2. **Rust** (MSVC toolchain) via rustup: <https://rustup.rs/>
   The default `stable-x86_64-pc-windows-msvc` is what you want.
3. **Node.js** (LTS): <https://nodejs.org/>
4. **WebView2 runtime** — preinstalled on Windows 10/11. If missing, get the
   Evergreen runtime from Microsoft.

The WiX (.msi) and NSIS (.exe) bundlers are downloaded automatically by the
Tauri CLI on first build, so an internet connection is needed once.

Verify in a fresh PowerShell:

```powershell
node --version ; npm --version ; cargo --version ; rustc --version
```

## 2. Get the code onto a native Windows path

Building over the `\\wsl.localhost\...` network path works but is slow and
occasionally flaky for Rust. Copy it to a real drive first:

```powershell
robocopy "\\wsl.localhost\Ubuntu\home\robrighter\development\pen-plotter-app" `
         "C:\dev\pen-plotter-app" /E /XD node_modules dist target .git
cd C:\dev\pen-plotter-app
```

(`/XD` skips the big/host-specific folders; they get regenerated on Windows.)

## 3. Build

Easiest — use the helper script (checks tools, installs, builds):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

Or do it by hand:

```powershell
npm install
npm run tauri build
```

If the linker isn't found, run the build from **"Developer PowerShell for VS"**
(it puts `link.exe` on PATH), or just re-open PowerShell after installing the
C++ Build Tools.

## 4. Where the artifacts land

```
src-tauri\target\release\pen-plotter-app.exe        <- standalone executable
src-tauri\target\release\bundle\msi\*.msi           <- MSI installer
src-tauri\target\release\bundle\nsis\*-setup.exe    <- NSIS setup installer
```

Double-click the `.msi` (or run the standalone `.exe`) to launch Pen Plotter
Studio as a real desktop window.

## Notes

- App identity (name, version, icons) lives in `src-tauri/tauri.conf.json`.
- To build only one installer type, set `bundle.targets` to e.g. `["msi"]`.
- The first Rust build is slow (compiles all dependencies); later builds are
  incremental and fast.

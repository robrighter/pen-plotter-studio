# Building the Standalone Windows App (.msi / .exe)

Tauri builds the native app on the platform you're targeting, so Windows
installers should be built on Windows. The repo is configured with icons and
bundling enabled; these are the host setup and build steps.

## 1. Install Prerequisites

1. **Visual Studio C++ Build Tools**: the MSVC compiler/linker Rust needs.
   Install "Build Tools for Visual Studio" and check the
   **"Desktop development with C++"** workload.
   <https://visualstudio.microsoft.com/visual-cpp-build-tools/>
2. **Rust** via rustup: <https://rustup.rs/>
   The build script installs the required `x86_64-pc-windows-msvc` and
   `aarch64-pc-windows-msvc` targets if they are missing.
3. **Node.js** LTS: <https://nodejs.org/>
4. **WebView2 runtime**: preinstalled on Windows 10/11. If missing, install the
   Evergreen runtime from Microsoft.

The WiX `.msi` and NSIS `.exe` bundlers are downloaded automatically by the
Tauri CLI on first build, so an internet connection is needed once.

Verify in a fresh PowerShell:

```powershell
node --version ; npm --version ; cargo --version ; rustc --version
```

## 2. Use a Native Windows Path

Building over a `\\wsl.localhost\...` network path works but is slow and can be
flaky for Rust. Copy the project to a real Windows drive first:

```powershell
robocopy "\\wsl.localhost\Ubuntu\home\robrighter\development\pen-plotter-app" `
         "C:\dev\pen-plotter-app" /E /XD node_modules dist target .git
cd C:\dev\pen-plotter-app
```

`/XD` skips large host-specific folders; they are regenerated on Windows.

## 3. Build

Build both Intel/AMD x64 and Windows ARM64 installers:

```powershell
npm run build:windows
```

Build only one architecture:

```powershell
npm run build:windows:x64
npm run build:windows:arm64
```

Equivalent direct PowerShell commands:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Arch all
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Arch x64
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Arch arm64
```

Equivalent batch wrappers:

```powershell
scripts\build-windows-x64.cmd
scripts\build-windows-arm64.cmd
scripts\build-windows-all.cmd
```

To skip `npm install` when dependencies are already current:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1 -Arch all -SkipInstall
```

## 4. Where Artifacts Land

Intel/AMD x64:

```text
src-tauri\target\x86_64-pc-windows-msvc\release\pen-plotter-app.exe
src-tauri\target\x86_64-pc-windows-msvc\release\bundle\msi\*.msi
src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\*-setup.exe
```

Windows ARM64:

```text
src-tauri\target\aarch64-pc-windows-msvc\release\pen-plotter-app.exe
src-tauri\target\aarch64-pc-windows-msvc\release\bundle\msi\*.msi
src-tauri\target\aarch64-pc-windows-msvc\release\bundle\nsis\*-setup.exe
```

Double-click the `.msi` or run the standalone `.exe` to launch Pen Plotter
Studio as a desktop window.

## Notes

- App identity (name, version, icons) lives in `src-tauri/tauri.conf.json`.
- To build only one installer type, set `bundle.targets` to e.g. `["msi"]`.
- The first Rust build is slow; later builds are incremental and faster.

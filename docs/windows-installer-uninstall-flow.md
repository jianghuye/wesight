# Windows installer and uninstall flow

This note captures the Windows installer changes after reviewing upstream PR #40.

## Goals

1. Make uninstall cleanup explicit and diagnosable.
2. Keep Windows Defender exclusion configurable instead of enabled by default.
3. Provide a visible distribution quickstart that can be used before releases or in CI.

## Current install flow

1. `npm run dist:win` prepares the portable Python runtime, builds renderer and main process code, builds bundled skills, then runs `electron-builder --win --x64`.
2. `scripts/electron-builder-hooks.cjs` prepares `build-tar/win-resources.tar` for Windows resources.
3. `electron-builder.json` ships `win-resources.tar` and `scripts/unpack-cfmind.cjs` as Windows extra resources.
4. `scripts/nsis-installer.nsh` stops running WeSight processes, removes the previous install directory, installs the new files, and extracts `win-resources.tar` with `WeSight.exe` running in `ELECTRON_RUN_AS_NODE=1` mode.
5. Install timing is written to `%APPDATA%\WeSight\install-timing.log`.

The Windows installer uses NSIS assisted mode instead of one-click mode, so users can choose the installation directory. All custom install and uninstall actions must use `$INSTDIR` instead of hard-coded paths.

## Updated uninstall flow

The NSIS `customUnInstall` macro now performs best-effort cleanup before electron-builder removes app data:

1. Write `%TEMP%\WeSight-uninstall-cleanup.log`.
2. Remove the Defender exclusion for `$INSTDIR\resources\cfmind` if it exists.
3. Remove HKCU Run entries that point to the current WeSight install directory or `WeSight.exe`.
4. Remove WeSight-named scheduled tasks only when their actions reference the current install directory or `WeSight.exe`.
5. Remove leftover installer resource files from interrupted installs.

This keeps cleanup scoped to resources that WeSight owns or resources that point at the current install path.

## Defender exclusion policy

Defender exclusion is a trusted-build optimization, not the default installer behavior.

Default:

```powershell
npm run dist:win
```

Trusted build with Defender exclusion:

```powershell
$env:WESIGHT_ENABLE_DEFENDER_EXCLUSION = '1'
npm run dist:win
```

Or through the release helper:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows-dist-quickstart.ps1 -EnableDefenderExclusion
```

When enabled, the NSIS script requests admin execution and attempts to add this exclusion:

```text
$INSTDIR\resources\cfmind
```

The add/remove operations are best-effort because enterprise policy may block them. The installer logs the result either way.

## Release quickstart

Use `scripts/windows-dist-quickstart.ps1` to make the full Windows distribution path visible:

1. Check Node.js 24 and npm.
2. Prepare PortableGit bash when needed.
3. Build the OpenClaw runtime for `win-x64`.
4. Prepare the portable Python runtime.
5. Build renderer assets.
6. Build bundled skills.
7. Compile the Electron main process.
8. Build the NSIS installer.
9. Print a manual smoke checklist for install, launch, auto-launch, uninstall, and cleanup-log verification.

The release smoke test should include one install into a non-default directory to verify `$INSTDIR`-based extraction, Defender cleanup, auto-launch cleanup, and install directory removal.

Useful options:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows-dist-quickstart.ps1 -NoSmokeChecklist
powershell -ExecutionPolicy Bypass -File scripts/windows-dist-quickstart.ps1 -SkipRuntime -SkipPython
powershell -ExecutionPolicy Bypass -File scripts/windows-dist-quickstart.ps1 -EnableDefenderExclusion
```

## Follow-up candidates

1. Add a CI job that runs the quickstart through `-NoSmokeChecklist` on `windows-latest`.
2. Add an automated installer smoke test on a Windows runner with a temporary install directory.
3. Promote OpenClaw runtime packaging to an explicit `bundled | optional | external` build mode instead of a single environment variable.

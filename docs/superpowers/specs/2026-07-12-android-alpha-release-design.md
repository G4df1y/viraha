# Viraha Android Alpha Release Design

> Date: 2026-07-12  
> Status: Approved direction - standalone Alpha APK in GitHub Releases

## Problem

The repository currently exposes only a pull-request-scoped `app-debug.apk` inside a GitHub Actions artifact. It is hidden from the normal repository and Releases pages, expires, downloads as a ZIP, uses a development build, and may require Metro on a computer. That is not an installable product path for a first-time user.

## Goal

Publish a public, standalone Android Alpha APK that a user can download from GitHub Releases, install without a computer or Metro server, and verify with SHA-256.

The first target device is the user's iQOO Neo. The app continues to require Android 9 / API 28 or newer.

## Non-Goals

- Google Play distribution
- Production signing or seamless upgrades to a future store build
- iOS distribution
- Automatic in-app updates
- A production security or privacy certification

## Distribution Design

1. Add a tag-triggered GitHub Actions workflow for tags matching `v*-alpha.*`.
2. Run the existing companion-core and mobile tests plus mobile type checking.
3. Generate the Android project with Expo prebuild.
4. Build the Gradle `release` variant so the JavaScript bundle is embedded and Metro is not required.
5. Verify the APK signature and confirm that the embedded application bundle exists.
6. Rename the output to `viraha-android-<tag>.apk` and generate a matching `.sha256` file.
7. Create a GitHub pre-release with both files using the workflow's scoped `GITHUB_TOKEN`.
8. Keep the existing pull-request preview workflow for developer diagnostics, but clearly distinguish its debug artifact from the installable Alpha release.

The immediate release tag will be `v0.1.0-alpha.1`.

## Signing Boundary

This Alpha uses the Expo/React Native generated preview signing configuration. It is suitable for device testing but is not the future production identity.

The Release notes and README must state:

- this is an Alpha test build;
- local data may be lost;
- a future production-signed APK may require uninstalling this Alpha before installation;
- users should not treat this signing key as a production trust guarantee.

A later production release must use a separately protected, persistent Android keystore and an explicit key-rotation and backup procedure.

## User Installation Flow

1. Open the repository's Releases page on the phone.
2. Open the latest Alpha release.
3. Download the `.apk` asset directly; no ZIP extraction is required.
4. Allow the browser or file manager to install unknown apps when Android asks.
5. Open the downloaded APK and choose Install.
6. Launch Viraha. The app must open without a computer, Metro URL, QR code, or Expo login.

The README will include these steps, the Android 9 minimum, the iQOO Neo compatibility note, and common install-error guidance.

## Verification

CI acceptance checks:

- companion-core tests pass;
- mobile tests pass;
- mobile type checking passes;
- `assembleRelease` succeeds;
- Android `apksigner verify` succeeds;
- the APK contains an embedded JavaScript/Hermes bundle;
- the Release contains exactly one APK and its SHA-256 file;
- the Release is marked pre-release and can be downloaded without GitHub Actions access.

Manual acceptance check:

- the user installs the APK on the iQOO Neo;
- the app reaches its first screen with Wi-Fi disconnected from the development computer;
- companion creation and local navigation work before an API key is configured.

## Failure Handling

- A failed test, build, signature check, or bundle check prevents Release creation.
- Release creation is tag-driven, so pull requests cannot publish public binaries.
- If a tag build fails, fix the workflow and publish a new Alpha tag rather than silently replacing an existing binary.
- GitHub Release assets are immutable for a given Alpha tag in normal operation; changed code receives a new tag.

## Success Criterion

The user can reach a stable GitHub Releases URL, tap a plainly named APK, install it on Android 9 or newer, and start Viraha without needing a computer.

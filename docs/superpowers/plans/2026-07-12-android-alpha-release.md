# Android Alpha Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a standalone Android 9+ Alpha APK on GitHub Releases that installs without Metro or a computer.

**Architecture:** A tag-triggered GitHub Actions workflow uses a read-only build job to build and verify Expo's Android release variant, then hands immutable release inputs to a checkout-free, write-scoped publish job. The publisher verifies the downloaded checksum and remote annotated tag before creating a draft pre-release and making it public only after asset upload succeeds. A dependency-free Node contract test protects the workflow and user-facing installation documentation.

**Tech Stack:** GitHub Actions, Expo 57, React Native 0.86, Gradle, Android build-tools, Node.js test runner, GitHub CLI.

---

## File Map

- Create `.github/workflows/android-alpha-release.yml`: tag-triggered standalone APK build and GitHub pre-release.
- Create `.github/release-notes/android-alpha.md`: reusable installation and signing warnings shown on the Release page.
- Create `.github/tests/android-alpha-release.test.mjs`: workflow and documentation contract test.
- Modify `.github/workflows/mobile-preview.yml`: label the existing debug artifact as developer-only and short-lived.
- Modify `README.md`: add the public Android installation path and troubleshooting.

### Task 1: Add A Failing Distribution Contract Test

**Files:**
- Create: `.github/tests/android-alpha-release.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('alpha workflow builds and publishes a standalone verified APK', async () => {
  const workflow = await read('.github/workflows/android-alpha-release.yml');
  assert.match(workflow, /v\*-alpha\.\*/);
  assert.match(workflow, /permissions:\s*\n\s+contents:\s*read/);
  assert.match(workflow, /\n  build:/);
  assert.match(workflow, /\n  publish:/);
  assert.match(workflow, /needs:\s*build/);
  assert.match(
    workflow,
    /\n  publish:[\s\S]*permissions:\s*\n\s+contents:\s*write/,
  );
  assert.match(
    workflow,
    /group:\s*android-alpha-publish-\$\{\{\s*github\.ref\s*\}\}/,
  );
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(workflow, /assembleRelease/);
  assert.match(workflow, /apksigner[^\n]*verify/);
  assert.match(workflow, /unzip -Z1/);
  assert.match(workflow, /grep -Fx[^\n]*assets\/index\.android\.bundle/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/download-artifact@[0-9a-f]{40}/);
  assert.match(workflow, /git ls-remote[^\n]*\^\{\}/);
  assert.match(workflow, /test "\$tag_sha" = "\$GITHUB_SHA"/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /--draft/);
  assert.match(workflow, /--prerelease/);
  assert.match(workflow, /gh release edit[\s\S]*--draft=false/);
});

test('release notes and README explain direct installation and signing limits', async () => {
  const [notes, readme] = await Promise.all([
    read('.github/release-notes/android-alpha.md'),
    read('README.md'),
  ]);
  for (const text of [notes, readme]) {
    assert.match(text, /Android 9/i);
    assert.match(text, /\.apk/);
    assert.match(text, /unknown apps|未知应用/i);
    assert.match(text, /uninstall|卸载/i);
  }
  assert.match(readme, /github\.com\/G4df1y\/viraha\/releases/);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test .github/tests/android-alpha-release.test.mjs`

Expected: FAIL because `android-alpha-release.yml` and `android-alpha.md` do not exist.

### Task 2: Implement The Standalone Release Workflow

**Files:**
- Create: `.github/workflows/android-alpha-release.yml`
- Create: `.github/release-notes/android-alpha.md`

- [ ] **Step 1: Add the tag-triggered workflow**

The workflow must:

```yaml
name: Android alpha release

on:
  push:
    tags:
      - 'v*-alpha.*'

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
```

Reuse the pinned checkout, pnpm, Node 22, Java 17, and Android setup actions from `mobile-preview.yml`, with checkout credential persistence disabled. Then run:

```yaml
      - run: pnpm install --frozen-lockfile
      - run: node --test .github/tests/android-alpha-release.test.mjs
      - run: pnpm --filter @viraha/companion-core test
      - run: pnpm --filter @viraha/companion-core build
      - run: pnpm --filter @viraha/mobile test
      - run: pnpm --filter @viraha/mobile typecheck
      - name: Generate Android project
        working-directory: apps/mobile
        run: pnpm exec expo prebuild --platform android --no-install
      - name: Build standalone APK
        working-directory: apps/mobile/android
        run: |
          chmod +x ./gradlew
          ./gradlew assembleRelease
```

Package and verify the result in `dist/`, requiring `assets/index.android.bundle`:

```yaml
      - name: Verify and package APK
        shell: bash
        run: |
          set -euo pipefail
          name="viraha-android-${GITHUB_REF_NAME}.apk"
          source="apps/mobile/android/app/build/outputs/apk/release/app-release.apk"
          mkdir -p dist
          cp "$source" "dist/$name"
          apksigner="$(find "$ANDROID_HOME/build-tools" -type f -name apksigner | sort -V | tail -n 1)"
          test -x "$apksigner"
          "$apksigner" verify --verbose "dist/$name"
          entries="$(unzip -Z1 "dist/$name")"
          grep -Fx 'assets/index.android.bundle' <<< "$entries"
          cd dist
          sha256sum "$name" > "$name.sha256"

      - name: Upload release inputs
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4
        with:
          name: android-alpha-release-inputs
          path: |
            dist/viraha-android-*.apk
            dist/viraha-android-*.apk.sha256
            .github/release-notes/android-alpha.md
          if-no-files-found: error
          include-hidden-files: true
```

Publish from a separate, checkout-free job with per-tag serialization and write permission scoped to that job:

```yaml
  publish:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write
    concurrency:
      group: android-alpha-publish-${{ github.ref }}
      cancel-in-progress: false

    steps:
      - name: Download release inputs
        uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4
        with:
          name: android-alpha-release-inputs
          path: .

      - name: Verify downloaded release inputs
        shell: bash
        run: |
          set -euo pipefail
          name="viraha-android-${GITHUB_REF_NAME}.apk"
          test -f ".github/release-notes/android-alpha.md"
          cd dist
          sha256sum --check "$name.sha256"

      - name: Verify release tag
        shell: bash
        run: |
          set -euo pipefail
          tag_sha="$(git ls-remote "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY.git" "refs/tags/${GITHUB_REF_NAME}^{}" | awk '{print $1}')"
          test -n "$tag_sha"
          test "$tag_sha" = "$GITHUB_SHA"

      - name: Publish GitHub pre-release
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          set -euo pipefail
          gh release create "$GITHUB_REF_NAME" \
            "dist/viraha-android-$GITHUB_REF_NAME.apk" \
            "dist/viraha-android-$GITHUB_REF_NAME.apk.sha256" \
            --repo "$GITHUB_REPOSITORY" \
            --verify-tag \
            --draft \
            --prerelease \
            --title "Viraha $GITHUB_REF_NAME" \
            --notes-file .github/release-notes/android-alpha.md
          gh release edit "$GITHUB_REF_NAME" \
            --repo "$GITHUB_REPOSITORY" \
            --draft=false
```

- [ ] **Step 2: Add release notes**

Include the direct `.apk` installation sequence, Android 9 minimum, unknown-app permission, Alpha data-loss warning, future uninstall requirement, and SHA-256 verification purpose.

- [ ] **Step 3: Run the contract test and verify GREEN**

Run: `node --test .github/tests/android-alpha-release.test.mjs`

Expected: workflow assertions pass; README assertions still fail until Task 3.

### Task 3: Make The Download Path Understandable

**Files:**
- Modify: `README.md`
- Modify: `.github/workflows/mobile-preview.yml`

- [ ] **Step 1: Add `Android Alpha` to README**

Document:

```markdown
## Android Alpha

Download the latest standalone APK from the GitHub Releases page:
https://github.com/G4df1y/viraha/releases

Requires Android 9 or newer. Download the `.apk` asset directly, allow the browser or file manager to install unknown apps, and open the downloaded file. No computer, Metro server, Expo account, or ZIP extraction is required.

Alpha builds use a test signing identity. A future production build may require uninstalling this Alpha first, which deletes local app data. Export anything important before upgrading.
```

Add Chinese installation steps immediately below the English paragraph.

- [ ] **Step 2: Relabel the debug artifact**

Change its artifact name to `viraha-mobile-debug-apk-requires-metro` and set `retention-days: 7` so it cannot be mistaken for the public standalone APK.

- [ ] **Step 3: Run the contract test and verify GREEN**

Run: `node --test .github/tests/android-alpha-release.test.mjs`

Expected: 2 tests pass, 0 fail.

### Task 4: Run Local Verification And Commit

**Files:**
- Verify all files from Tasks 1-3.

- [ ] **Step 1: Run focused verification**

Run:

```bash
node --test .github/tests/android-alpha-release.test.mjs
pnpm --filter @viraha/companion-core test
pnpm --filter @viraha/mobile test
pnpm --filter @viraha/mobile typecheck
```

Expected: every command exits 0.

- [ ] **Step 2: Review the diff**

Run: `git diff --check` and `git diff -- .github README.md`

Expected: no whitespace errors; only the release workflow, release notes, contract test, debug artifact label, and README change.

- [ ] **Step 3: Commit implementation files only**

```bash
git add .github/workflows/android-alpha-release.yml \
  .github/workflows/mobile-preview.yml \
  .github/release-notes/android-alpha.md \
  .github/tests/android-alpha-release.test.mjs \
  README.md
git commit -m "ci: publish standalone Android alpha APK"
```

Do not stage the unrelated market-research Markdown or PDF.

### Task 5: Publish And Verify `v0.1.0-alpha.1`

- [ ] **Step 1: Push the feature branch**

Run: `git push origin feature/arete-studio`

Expected: PR #1 updates and its checks start.

- [ ] **Step 2: Wait for pull-request checks**

Expected: mobile tests, type checking, export, and debug preview checks succeed.

- [ ] **Step 3: Create and push the Alpha tag**

```bash
git tag -a v0.1.0-alpha.1 -m "Viraha Android alpha 0.1.0"
git push origin v0.1.0-alpha.1
```

- [ ] **Step 4: Monitor the tag workflow**

Expected: tests pass, `assembleRelease` succeeds, signature and exact embedded-bundle checks pass, the artifact handoff checksum matches, and the remote annotated tag peels to `GITHUB_SHA`. The publish job creates and uploads a draft pre-release, then makes it public.

- [ ] **Step 5: Verify the public Release**

Verify `https://github.com/G4df1y/viraha/releases/tag/v0.1.0-alpha.1` exposes:

- `viraha-android-v0.1.0-alpha.1.apk`
- `viraha-android-v0.1.0-alpha.1.apk.sha256`

Download the APK without Actions artifact access and confirm its digest matches the `.sha256` file.

- [ ] **Step 6: Hand off real-device verification**

Give the user the direct Release URL and the four phone steps: download APK, allow unknown apps, install, open. Ask them to report the exact screen or Android error if installation fails.

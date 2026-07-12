import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL('../../' + path, import.meta.url), 'utf8');

const indentation = (line) => line.length - line.trimStart().length;
const isYamlContent = (line) => line.trim() && !line.trimStart().startsWith('#');

const yamlBlockAt = (lines, start, origin = 0) => {
  const blockIndent = indentation(lines[start]);
  let end = start + 1;
  while (end < lines.length) {
    if (isYamlContent(lines[end]) && indentation(lines[end]) <= blockIndent) break;
    end += 1;
  }
  return {
    indent: blockIndent,
    lines: lines.slice(start, end),
    startLine: origin + start,
  };
};

const blockText = (block) => block.lines.join('\n');

const extractTopLevelYamlBlock = (yaml, key) => {
  const lines = yaml.split(/\r?\n/);
  const matches = lines
    .map((line, index) => ({ index, line }))
    .filter(
      ({ line }) => indentation(line) === 0 && line.trimEnd() === key + ':',
    );
  assert.equal(matches.length, 1, 'Expected one top-level YAML block: ' + key);
  return yamlBlockAt(lines, matches[0].index);
};

const directChildIndent = (block) => {
  const childIndents = block.lines
    .slice(1)
    .filter(isYamlContent)
    .map(indentation)
    .filter((value) => value > block.indent);
  assert.ok(childIndents.length, 'YAML block has no children');
  return Math.min(...childIndents);
};

const extractYamlChildBlock = (parent, key) => {
  const childIndent = directChildIndent(parent);
  const matches = parent.lines
    .map((line, index) => ({ index, line }))
    .slice(1)
    .filter(
      ({ line }) =>
        indentation(line) === childIndent && line.trim() === key + ':',
    );
  assert.equal(matches.length, 1, 'Expected one direct YAML child: ' + key);
  return yamlBlockAt(parent.lines, matches[0].index, parent.startLine);
};

const unquote = (value) => {
  const quote = value.at(0);
  return (quote === "'" || quote === '"') && value.at(-1) === quote
    ? value.slice(1, -1)
    : value;
};

const extractDirectYamlScalar = (parent, key) => {
  const childIndent = directChildIndent(parent);
  const prefix = key + ':';
  const matches = parent.lines
    .map((line, index) => ({ index, line }))
    .slice(1)
    .filter(({ line }) => {
      if (indentation(line) !== childIndent) return false;
      const text = line.trim();
      return text.startsWith(prefix) && text.slice(prefix.length).trim();
    });
  assert.equal(matches.length, 1, 'Expected one direct YAML scalar: ' + key);
  const value = matches[0].line
    .trim()
    .slice(prefix.length)
    .replace(/[ \t]+#.*$/, '')
    .trim();
  return unquote(value);
};

const extractYamlLiteralBlock = (parent, key) => {
  const childIndent = directChildIndent(parent);
  const prefix = key + ':';
  const matches = parent.lines
    .map((line, index) => ({ index, line }))
    .slice(1)
    .filter(({ line }) => {
      if (indentation(line) !== childIndent) return false;
      const text = line.trim();
      return (
        text.startsWith(prefix) &&
        /^\|[+-]?(?:[ \t]+#.*)?$/.test(text.slice(prefix.length).trim())
      );
    });
  assert.equal(matches.length, 1, 'Expected one YAML literal block: ' + key);
  return yamlBlockAt(parent.lines, matches[0].index, parent.startLine);
};

const extractNamedYamlStep = (steps, name) => {
  const stepIndent = directChildIndent(steps);
  const stepHeader = /^([ \t]*)-[ \t]+name:[ \t]*(.+?)[ \t]*$/;
  const matches = steps.lines
    .map((line, index) => ({ index, match: line.match(stepHeader) }))
    .filter(
      ({ index, match }) =>
        index > 0 &&
        match &&
        indentation(steps.lines[index]) === stepIndent &&
        unquote(match[2]) === name,
    );
  assert.equal(matches.length, 1, 'Expected one named YAML step: ' + name);
  return yamlBlockAt(steps.lines, matches[0].index, steps.startLine);
};

const findUniqueDirectStepLine = (steps, pattern, description) => {
  const stepIndent = directChildIndent(steps);
  const matches = steps.lines
    .map((line, index) => ({ index, line }))
    .slice(1)
    .filter(
      ({ line }) =>
        indentation(line) === stepIndent && pattern.test(line.trimStart()),
    );
  assert.equal(matches.length, 1, 'Expected one build step for ' + description);
  return { startLine: steps.startLine + matches[0].index };
};

const assertSourceOrder = (items, description) => {
  assert.ok(
    items.every(
      (item, index) => index === 0 || items[index - 1].startLine < item.startLine,
    ),
    description,
  );
};

const extractRunScript = (step) => {
  const propertyIndent = directChildIndent(step);
  const runHeader = /^([ \t]*)run:[ \t]*\|[+-]?[ \t]*(?:#.*)?$/;
  const matches = step.lines
    .map((line, index) => ({ index, line }))
    .slice(1)
    .filter(
      ({ line }) =>
        indentation(line) === propertyIndent && runHeader.test(line),
    );
  assert.equal(matches.length, 1, 'Expected one run: | script');

  const runIndex = matches[0].index;
  const runIndent = indentation(step.lines[runIndex]);
  let end = runIndex + 1;
  while (end < step.lines.length) {
    if (isYamlContent(step.lines[end]) && indentation(step.lines[end]) <= runIndent) {
      break;
    }
    end += 1;
  }

  const scriptLines = step.lines.slice(runIndex + 1, end);
  const contentIndents = scriptLines
    .filter((line) => line.trim())
    .map(indentation);
  assert.ok(contentIndents.length, 'run: | script is empty');
  const contentIndent = Math.min(...contentIndents);
  return scriptLines
    .map((line) => (line.trim() ? line.slice(contentIndent) : ''))
    .join('\n');
};

const logicalShellCommands = (script) => {
  const commands = [];
  let current = '';
  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const continued = /\\[ \t]*$/.test(line);
    const fragment = continued ? line.replace(/\\[ \t]*$/, '').trimEnd() : line;
    current += (current ? ' ' : '') + fragment;
    if (!continued) {
      commands.push(current);
      current = '';
    }
  }
  assert.equal(current, '', 'Shell script ends with an unterminated continuation');
  return commands;
};

const findUniqueCommand = (commands, pattern, description) => {
  const matches = commands
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => pattern.test(command));
  assert.equal(matches.length, 1, 'Expected one command for ' + description);
  return matches[0];
};

const disabledCondition =
  /^[ \t]*(?:-[ \t]+)?if:[ \t]*(?:\$\{\{[ \t]*)?['"]?false['"]?(?:[ \t]*\}\})?[ \t]*(?:#.*)?$/im;

const assertEnabled = (block, description) => {
  assert.doesNotMatch(
    blockText(block),
    disabledCondition,
    description + ' must not use if: false',
  );
};

test('alpha workflow builds and publishes a standalone verified APK', async () => {
  const workflow = await read('.github/workflows/android-alpha-release.yml');

  const on = extractTopLevelYamlBlock(workflow, 'on');
  const push = extractYamlChildBlock(on, 'push');
  const tags = extractYamlChildBlock(push, 'tags');
  assert.match(
    blockText(tags),
    /^[ \t]+-[ \t]*['"]v\*-alpha\.\*['"][ \t]*$/m,
  );

  const permissions = extractTopLevelYamlBlock(workflow, 'permissions');
  assert.equal(extractDirectYamlScalar(permissions, 'contents'), 'read');

  const jobs = extractTopLevelYamlBlock(workflow, 'jobs');
  const buildJob = extractYamlChildBlock(jobs, 'build');
  const buildSteps = extractYamlChildBlock(buildJob, 'steps');
  assertEnabled(buildJob, 'build job and its steps');
  assert.doesNotMatch(
    blockText(buildJob),
    /^[ \t]+contents:[ \t]*write[ \t]*(?:#.*)?$/im,
  );
  assert.doesNotMatch(
    blockText(buildSteps),
    /^[ \t]*gh[ \t]+release[ \t]+(?:create|edit)(?:[ \t]|$)/m,
  );

  const contractTest = findUniqueDirectStepLine(
    buildSteps,
    /^-[ \t]+run:[ \t]*node[ \t]+--test[ \t]+\.github\/tests\/android-alpha-release\.test\.mjs[ \t]*$/,
    'release contract tests',
  );
  const coreTest = findUniqueDirectStepLine(
    buildSteps,
    /^-[ \t]+run:[ \t]*pnpm[ \t]+--filter[ \t]+@viraha\/companion-core[ \t]+test[ \t]*$/,
    'companion core tests',
  );
  const coreBuild = findUniqueDirectStepLine(
    buildSteps,
    /^-[ \t]+run:[ \t]*pnpm[ \t]+--filter[ \t]+@viraha\/companion-core[ \t]+build[ \t]*$/,
    'companion core build',
  );
  const mobileTest = findUniqueDirectStepLine(
    buildSteps,
    /^-[ \t]+run:[ \t]*pnpm[ \t]+--filter[ \t]+@viraha\/mobile[ \t]+test[ \t]*$/,
    'mobile tests',
  );
  const mobileTypecheck = findUniqueDirectStepLine(
    buildSteps,
    /^-[ \t]+run:[ \t]*pnpm[ \t]+--filter[ \t]+@viraha\/mobile[ \t]+typecheck[ \t]*$/,
    'mobile typecheck',
  );
  const prebuild = extractNamedYamlStep(buildSteps, 'Generate Android project');
  const assemble = extractNamedYamlStep(buildSteps, 'Build standalone APK');
  const verify = extractNamedYamlStep(buildSteps, 'Verify and package APK');
  const upload = extractNamedYamlStep(buildSteps, 'Upload release inputs');
  assertSourceOrder(
    [
      contractTest,
      coreTest,
      coreBuild,
      mobileTest,
      mobileTypecheck,
      prebuild,
      assemble,
      verify,
      upload,
    ],
    'Build validation, packaging, and upload steps must appear in source order',
  );
  for (const [description, step] of [
    ['Generate Android project step', prebuild],
    ['Build standalone APK step', assemble],
    ['Verify and package APK step', verify],
    ['Upload release inputs step', upload],
  ]) {
    assertEnabled(step, description);
  }

  assert.equal(
    extractDirectYamlScalar(prebuild, 'working-directory'),
    'apps/mobile',
  );
  assert.equal(
    extractDirectYamlScalar(prebuild, 'run'),
    'pnpm exec expo prebuild --platform android --no-install',
  );
  const buildCommands = logicalShellCommands(extractRunScript(assemble));
  findUniqueCommand(
    buildCommands,
    /^\.\/gradlew[ \t]+assembleRelease[ \t]*$/,
    'assembleRelease',
  );

  const verifyCommands = logicalShellCommands(extractRunScript(verify));
  const name = findUniqueCommand(
    verifyCommands,
    /^name=(['"]?)viraha-android-\$\{GITHUB_REF_NAME\}\.apk\1$/,
    'exact release APK name assignment',
  );
  const source = findUniqueCommand(
    verifyCommands,
    /^source=(['"]?)apps\/mobile\/android\/app\/build\/outputs\/apk\/release\/app-release\.apk\1$/,
    'release APK source assignment',
  );
  const copy = findUniqueCommand(
    verifyCommands,
    /^cp[ \t]+['"]?\$source['"]?[ \t]+['"]?dist\/\$name['"]?[ \t]*$/,
    'release APK copy',
  );
  const signature = findUniqueCommand(
    verifyCommands,
    /^['"]?\$apksigner['"]?[ \t]+verify(?:[ \t]+--[\w-]+)*[ \t]+['"]?dist\/\$name['"]?[ \t]*$/,
    'release APK signature verification',
  );
  const entries = findUniqueCommand(
    verifyCommands,
    /^entries="\$\(unzip[ \t]+-Z1[ \t]+"dist\/\$name"\)"$/,
    'exact APK archive entry capture',
  );
  const bundle = findUniqueCommand(
    verifyCommands,
    /^grep[ \t]+-Fx[ \t]+'assets\/index\.android\.bundle'[ \t]+<<<[ \t]*"\$entries"[ \t]*$/,
    'exact embedded Android bundle entry',
  );
  const changeDirectory = findUniqueCommand(
    verifyCommands,
    /^cd[ \t]+['"]?dist['"]?[ \t]*$/,
    'dist working directory',
  );
  const checksum = findUniqueCommand(
    verifyCommands,
    /^sha256sum[ \t]+['"]?\$name['"]?[ \t]*>[ \t]*['"]?\$name\.sha256['"]?[ \t]*$/,
    'release APK checksum',
  );
  assert.ok(name.index < copy.index && source.index < copy.index);
  assert.ok(
    copy.index < signature.index &&
      signature.index < entries.index &&
      entries.index < bundle.index &&
      bundle.index < changeDirectory.index &&
      changeDirectory.index < checksum.index,
    'Copy, signature, exact bundle, and checksum commands must appear in order',
  );

  assert.match(
    extractDirectYamlScalar(upload, 'uses'),
    /^actions\/upload-artifact@[0-9a-f]{40}$/,
  );
  const uploadWith = extractYamlChildBlock(upload, 'with');
  assert.equal(
    extractDirectYamlScalar(uploadWith, 'name'),
    'android-alpha-release-inputs',
  );
  assert.equal(
    extractDirectYamlScalar(uploadWith, 'include-hidden-files'),
    'true',
  );
  const uploadPath = extractYamlLiteralBlock(uploadWith, 'path');
  assert.deepEqual(
    uploadPath.lines.slice(1).filter(isYamlContent).map((line) => line.trim()),
    [
      'dist/viraha-android-*.apk',
      'dist/viraha-android-*.apk.sha256',
      '.github/release-notes/android-alpha.md',
    ],
  );

  const publishJob = extractYamlChildBlock(jobs, 'publish');
  assertEnabled(publishJob, 'publish job and its steps');
  assert.equal(extractDirectYamlScalar(publishJob, 'needs'), 'build');
  const publishPermissions = extractYamlChildBlock(publishJob, 'permissions');
  assert.equal(
    extractDirectYamlScalar(publishPermissions, 'contents'),
    'write',
  );
  const concurrency = extractYamlChildBlock(publishJob, 'concurrency');
  assert.match(
    extractDirectYamlScalar(concurrency, 'group'),
    /^android-alpha-publish-\$\{\{[ \t]*github\.ref[ \t]*\}\}$/,
  );
  assert.equal(
    extractDirectYamlScalar(concurrency, 'cancel-in-progress'),
    'false',
  );

  const publishSteps = extractYamlChildBlock(publishJob, 'steps');
  const download = extractNamedYamlStep(
    publishSteps,
    'Download release inputs',
  );
  const verifyInputs = extractNamedYamlStep(
    publishSteps,
    'Verify downloaded release inputs',
  );
  const verifyTag = extractNamedYamlStep(publishSteps, 'Verify release tag');
  const publish = extractNamedYamlStep(
    publishSteps,
    'Publish GitHub pre-release',
  );
  assertSourceOrder(
    [download, verifyInputs, verifyTag, publish],
    'Download, checksum verification, tag verification, and publication must appear in source order',
  );
  for (const [description, step] of [
    ['Download release inputs step', download],
    ['Verify downloaded release inputs step', verifyInputs],
    ['Verify release tag step', verifyTag],
    ['Publish GitHub pre-release step', publish],
  ]) {
    assertEnabled(step, description);
  }

  assert.match(
    extractDirectYamlScalar(download, 'uses'),
    /^actions\/download-artifact@[0-9a-f]{40}$/,
  );
  const downloadWith = extractYamlChildBlock(download, 'with');
  assert.equal(
    extractDirectYamlScalar(downloadWith, 'name'),
    'android-alpha-release-inputs',
  );
  assert.equal(extractDirectYamlScalar(downloadWith, 'path'), '.');

  const inputCommands = logicalShellCommands(extractRunScript(verifyInputs));
  const downloadedName = findUniqueCommand(
    inputCommands,
    /^name=(['"]?)viraha-android-\$\{GITHUB_REF_NAME\}\.apk\1$/,
    'downloaded release APK name assignment',
  );
  const downloadedNotes = findUniqueCommand(
    inputCommands,
    /^test[ \t]+-f[ \t]+['"]\.github\/release-notes\/android-alpha\.md['"][ \t]*$/,
    'downloaded release notes',
  );
  const downloadedChangeDirectory = findUniqueCommand(
    inputCommands,
    /^cd[ \t]+['"]?dist['"]?[ \t]*$/,
    'downloaded release dist directory',
  );
  const downloadedChecksum = findUniqueCommand(
    inputCommands,
    /^sha256sum[ \t]+--check[ \t]+"\$name\.sha256"[ \t]*$/,
    'downloaded release APK checksum verification',
  );
  assert.ok(
    downloadedName.index < downloadedNotes.index &&
      downloadedNotes.index < downloadedChangeDirectory.index &&
      downloadedChangeDirectory.index < downloadedChecksum.index,
    'Downloaded APK naming, notes, directory, and checksum verification must appear in order',
  );

  const tagCommands = logicalShellCommands(extractRunScript(verifyTag));
  const remoteTag = findUniqueCommand(
    tagCommands,
    /^tag_sha="\$\(git[ \t]+ls-remote[ \t]+"\$GITHUB_SERVER_URL\/\$GITHUB_REPOSITORY\.git"[ \t]+"refs\/tags\/\$\{GITHUB_REF_NAME\}\^\{\}"[ \t]*\|[ \t]*awk[ \t]+'\{print[ \t]+\$1\}'\)"$/,
    'remote annotated tag dereference',
  );
  const tagEquality = findUniqueCommand(
    tagCommands,
    /^test[ \t]+"\$tag_sha"[ \t]+=[ \t]+"\$GITHUB_SHA"[ \t]*$/,
    'remote tag equality with GITHUB_SHA',
  );
  assert.ok(
    remoteTag.index < tagEquality.index,
    'Remote tag dereference must precede its equality check',
  );

  const publishCommands = logicalShellCommands(extractRunScript(publish));
  const createDraft = findUniqueCommand(
    publishCommands,
    /^gh[ \t]+release[ \t]+create(?:[ \t]|$)/,
    'gh release create',
  );
  assert.match(
    createDraft.command,
    /^gh[ \t]+release[ \t]+create[ \t]+(['"])\$(GITHUB_REF_NAME|\{GITHUB_REF_NAME\})\1[ \t]+(['"])dist\/viraha-android-\$\2\.apk\3[ \t]+(['"])dist\/viraha-android-\$\2\.apk\.sha256\4[ \t]+--repo[ \t]+(['"])\$GITHUB_REPOSITORY\5[ \t]+--verify-tag[ \t]+--draft[ \t]+--prerelease[ \t]+--title[ \t]+(['"])Viraha[ \t]+\$\2\6[ \t]+--notes-file[ \t]+\.github\/release-notes\/android-alpha\.md[ \t]*$/,
  );
  const publishDraft = findUniqueCommand(
    publishCommands,
    /^gh[ \t]+release[ \t]+edit(?:[ \t]|$)/,
    'gh release edit',
  );
  assert.match(
    publishDraft.command,
    /^gh[ \t]+release[ \t]+edit[ \t]+(['"])\$(GITHUB_REF_NAME|\{GITHUB_REF_NAME\})\1[ \t]+--repo[ \t]+(['"])\$GITHUB_REPOSITORY\3[ \t]+--draft=false[ \t]*$/,
  );
  assert.ok(
    createDraft.index < publishDraft.index,
    'Draft release creation must complete before it is made public',
  );
});

test('release notes and README explain direct installation and signing limits', async () => {
  const [notes, readme] = await Promise.all([
    read('.github/release-notes/android-alpha.md'),
    read('README.md'),
  ]);
  const installationContract = [
    /Requires Android 9 or newer\./i,
    /Download the (?:\x60)?\.apk(?:\x60)? asset directly,[ \t]+allow the browser or file manager to install unknown apps,[ \t]+and open the downloaded file\./i,
    /No computer,[ \t]+Metro server,[ \t]+Expo account,[ \t]+or ZIP extraction is required\./i,
    /Alpha builds use a test signing identity\./i,
    /A future production build may require uninstalling this Alpha first,[ \t]+which deletes local app data\./i,
    /The Alpha test signing key is not a production trust guarantee and must not be treated as proof of a production release\./i,
  ];
  for (const text of [notes, readme]) {
    for (const statement of installationContract) {
      assert.match(text, statement);
    }
  }
  assert.match(
    readme,
    /https:\/\/github\.com\/G4df1y\/viraha\/releases(?:[)\t ]|\r?\n|$)/,
  );
  assert.match(
    readme,
    /Alpha 测试签名密钥不提供生产环境的信任保证，也不能作为正式版本身份的证明。/,
  );
});

import { afterEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const installer = resolve(process.cwd(), "scripts/install-hooks.mjs");
const temporaryDirectories = [];
const inheritedGitEnvironment = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
];

function runGit(args, cwd, env) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

function createRepository() {
  const directory = mkdtempSync(join(tmpdir(), "install-hooks-test-"));
  temporaryDirectories.push(directory);
  const root = join(directory, "repo");
  const globalConfig = join(directory, "global.gitconfig");
  mkdirSync(root);
  writeFileSync(globalConfig, "");
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: globalConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    HOME: directory,
  };
  for (const variable of inheritedGitEnvironment) delete env[variable];
  runGit(["init", "--quiet", root], directory, env);
  return { directory, root, globalConfig, env };
}

function createHooks(root) {
  const hooksDirectory = join(root, ".githooks");
  mkdirSync(hooksDirectory);
  for (const name of ["pre-commit", "commit-msg"]) {
    const hook = join(hooksDirectory, name);
    writeFileSync(hook, "#!/bin/sh\nexit 0\n");
    chmodSync(hook, 0o755);
  }
  return hooksDirectory;
}

function configValue(repo, scope, env) {
  const result = spawnSync(
    "git",
    ["config", scope, "--null", "--get-all", "core.hooksPath"],
    { cwd: repo, env, encoding: "utf8" },
  );
  if (result.status === 1) return null;
  if (result.status !== 0) {
    throw new Error(`could not read ${scope} config: ${result.stderr}`);
  }
  return result.stdout;
}

function runInstaller(root, env) {
  return spawnSync(process.execPath, [installer], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe("install-hooks", () => {
  it("rejects a symlinked .githooks directory without changing local or global config", () => {
    const { directory, root, env } = createRepository();
    const outsideHooks = join(directory, "outside-hooks");
    mkdirSync(outsideHooks);
    for (const name of ["pre-commit", "commit-msg"]) {
      const hook = join(outsideHooks, name);
      writeFileSync(hook, "#!/bin/sh\nexit 0\n");
      chmodSync(hook, 0o755);
    }
    symlinkSync(outsideHooks, join(root, ".githooks"), "dir");
    runGit(["config", "--global", "core.hooksPath", "existing-global"], root, env);
    const localBefore = configValue(root, "--local", env);
    const globalBefore = configValue(root, "--global", env);

    const result = runInstaller(root, env);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/\.githooks/);
    expect(configValue(root, "--local", env)).toBe(localBefore);
    expect(configValue(root, "--global", env)).toBe(globalBefore);
  });

  it("rejects a symlinked hook without changing local or global config", () => {
    const { directory, root, env } = createRepository();
    const hooksDirectory = createHooks(root);
    const outsideHook = join(directory, "outside-commit-msg");
    writeFileSync(outsideHook, "#!/bin/sh\nexit 0\n");
    chmodSync(outsideHook, 0o755);
    rmSync(join(hooksDirectory, "commit-msg"));
    symlinkSync(outsideHook, join(hooksDirectory, "commit-msg"));
    runGit(["config", "--global", "core.hooksPath", "existing-global"], root, env);
    const localBefore = configValue(root, "--local", env);
    const globalBefore = configValue(root, "--global", env);

    const result = runInstaller(root, env);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/commit-msg/);
    expect(configValue(root, "--local", env)).toBe(localBefore);
    expect(configValue(root, "--global", env)).toBe(globalBefore);
  });

  it("sets the local hooks path and is idempotent", () => {
    const { root, env } = createRepository();
    createHooks(root);

    const first = runInstaller(root, env);
    const localAfterFirst = configValue(root, "--local", env);
    const second = runInstaller(root, env);

    expect(first.status).toBe(0);
    expect(localAfterFirst).toBe(".githooks\0");
    expect(second.status).toBe(0);
    expect(configValue(root, "--local", env)).toBe(localAfterFirst);
  });

  it("preserves a conflicting local hooks path", () => {
    const { root, env } = createRepository();
    createHooks(root);
    runGit(["config", "--local", "core.hooksPath", "custom-hooks"], root, env);
    const localBefore = configValue(root, "--local", env);

    const result = runInstaller(root, env);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/valor diferente/);
    expect(configValue(root, "--local", env)).toBe(localBefore);
  });

  it("requires both hook files to have executable bits", () => {
    const { root, env } = createRepository();
    const hooksDirectory = createHooks(root);
    chmodSync(join(hooksDirectory, "pre-commit"), 0o644);

    const result = runInstaller(root, env);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/pre-commit/);
    expect(configValue(root, "--local", env)).toBeNull();
  });
});

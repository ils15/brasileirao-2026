#!/usr/bin/env node
import { accessSync, constants, lstatSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, join, relative, sep } from "node:path";

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) {
    throw new Error(`não foi possível executar git: ${result.error.message}`);
  }
  return result;
}

function gitRoot() {
  const result = runGit(["rev-parse", "--show-toplevel"], process.cwd());
  if (result.status !== 0) {
    throw new Error("execute este instalador dentro de um repositório Git.");
  }
  return result.stdout.trim();
}

function localHooksPath(root) {
  const result = runGit(
    ["config", "--local", "--null", "--get-all", "core.hooksPath"],
    root,
  );
  if (result.status === 1) return [];
  if (result.status !== 0) {
    throw new Error(
      `não foi possível ler core.hooksPath local: ${result.stderr.trim()}`,
    );
  }
  const values = result.stdout.split("\0");
  if (values.at(-1) === "") values.pop();
  return values;
}

function verifyHooks(root) {
  const realRoot = realpathSync(root);
  const hooksDirectory = join(root, ".githooks");

  let hooksDirectoryStat;
  try {
    hooksDirectoryStat = lstatSync(hooksDirectory);
  } catch {
    throw new Error(`diretório de hooks ausente ou inválido: ${hooksDirectory}`);
  }
  if (!hooksDirectoryStat.isDirectory()) {
    throw new Error(`diretório de hooks precisa ser um diretório real: ${hooksDirectory}`);
  }
  assertInsideRepository(realRoot, realpathSync(hooksDirectory), hooksDirectory);

  for (const name of ["pre-commit", "commit-msg"]) {
    const path = join(hooksDirectory, name);
    try {
      if (!lstatSync(path).isFile()) {
        throw new Error("not a regular file");
      }
      accessSync(path, constants.X_OK);
      assertInsideRepository(realRoot, realpathSync(path), path);
    } catch {
      throw new Error(`hook ausente, inválido ou não executável: ${path}`);
    }
  }
}

function assertInsideRepository(realRoot, target, label) {
  const pathFromRoot = relative(realRoot, target);
  if (
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(`alvo fora da raiz real do repositório: ${label}`);
  }
}

try {
  const root = gitRoot();
  verifyHooks(root);

  const configured = localHooksPath(root);
  if (configured.length > 0) {
    if (configured.length === 1 && configured[0] === ".githooks") {
      console.log("Hooks já ativados para este repositório (core.hooksPath=.githooks).\n");
      process.exit(0);
    }
    throw new Error(
      `core.hooksPath local já tem valor diferente (${configured.map((value) => JSON.stringify(value)).join(", ")}); nada foi alterado. Remova ou ajuste essa configuração local manualmente antes de executar novamente.`,
    );
  }

  const result = runGit(
    ["config", "--local", "core.hooksPath", ".githooks"],
    root,
  );
  if (result.status !== 0) {
    throw new Error(
      `não foi possível configurar core.hooksPath local: ${result.stderr.trim()}`,
    );
  }
  console.log("Hooks ativados somente neste repositório (core.hooksPath=.githooks).");
} catch (error) {
  console.error(`install-hooks: ${error.message}`);
  process.exitCode = 1;
}

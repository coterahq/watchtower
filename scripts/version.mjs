#!/usr/bin/env bun
// Set every workspace package (and the workspace root) to one version.
//
//   bun scripts/version.mjs 0.2.0          bump, commit and tag
//   bun scripts/version.mjs minor          same, version derived from the root
//   bun scripts/version.mjs 0.2.0 --no-git edit the manifests only
//   bun scripts/version.mjs --check 0.2.0  assert everything is already at 0.2.0
//
// Internal dependencies use `workspace:^`, which bun rewrites to the real
// version at publish time, so they never need editing here.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { LOCKFILE, ROOT, readLockfileVersions, readPackages } from "./workspace.mjs";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/;
const ROOT_MANIFEST = join(ROOT, "package.json");

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function git(args, { capture = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: ROOT,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) fail(`git ${args.join(" ")} failed`);
  return capture ? result.stdout.trim() : "";
}

function readVersion(path) {
  return JSON.parse(readFileSync(path, "utf8")).version;
}

/** Rewrite just the version field, preserving key order and formatting. */
function writeVersion(path, version) {
  const source = readFileSync(path, "utf8");
  const updated = source.replace(/^(\s*"version"\s*:\s*)"[^"]*"/m, `$1"${version}"`);
  if (updated === source) fail(`could not find a "version" field in ${relative(ROOT, path)}`);
  writeFileSync(path, updated);
}

function nextVersion(current, bump) {
  if (SEMVER.test(bump)) return bump;
  const match = SEMVER.exec(current);
  if (!match) fail(`root version "${current}" is not valid semver, so "${bump}" cannot be applied`);
  const [major, minor, patch] = match.slice(1, 4).map(Number);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  fail(`"${bump}" is neither a semver version nor one of major, minor, patch`);
}

const args = process.argv.slice(2);
const packages = readPackages();

if (args[0] === "--check") {
  const expected = args[1];
  if (!expected) fail("--check needs a version, e.g. --check 0.2.0");

  const problems = [];

  for (const pkg of [{ name: "<workspace root>", version: readVersion(ROOT_MANIFEST) }, ...packages]) {
    if (pkg.version !== expected) {
      problems.push(`${pkg.name} is at ${pkg.version}, expected ${expected}`);
    }
  }

  // A stale lockfile is the dangerous case: the manifests can all read 0.2.0
  // while bun still resolves our `workspace:^` ranges to the old version, so
  // the published packages would depend on versions of each other that this
  // release never produced.
  const locked = readLockfileVersions();
  for (const pkg of packages) {
    const lockedVersion = locked.get(pkg.name);
    if (lockedVersion === undefined) {
      problems.push(`${pkg.name} is missing from bun.lock`);
    } else if (lockedVersion !== expected) {
      problems.push(`bun.lock still records ${pkg.name} at ${lockedVersion}, expected ${expected}`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(`error: ${problem}`);
    fail(`run \`bun scripts/version.mjs ${expected}\` and push the result before releasing`);
  }
  console.log(`All ${packages.length} packages and bun.lock are at ${expected}.`);
  process.exit(0);
}

const bump = args.find((arg) => !arg.startsWith("--"));
if (!bump) fail("usage: bun scripts/version.mjs <version|major|minor|patch> [--no-git]");

const useGit = !args.includes("--no-git");
const version = nextVersion(readVersion(ROOT_MANIFEST), bump);
const tag = `v${version}`;

if (useGit) {
  if (git(["status", "--porcelain"], { capture: true })) {
    fail("working tree is dirty; commit or stash first, or pass --no-git");
  }
  const existing = git(["tag", "--list", tag], { capture: true });
  if (existing) fail(`tag ${tag} already exists`);
}

const manifests = [ROOT_MANIFEST, ...packages.map((pkg) => pkg.manifestPath)];
for (const path of manifests) writeVersion(path, version);
for (const pkg of packages) console.log(`  ${pkg.name}  ${pkg.version} -> ${version}`);

// bun caches each workspace package's version in bun.lock and will not refresh
// it on a normal install, so the lockfile has to be regenerated. Without this
// `bun publish` resolves the `workspace:^` ranges to the *previous* version.
console.log("\nRegenerating bun.lock...");
rmSync(LOCKFILE, { force: true });
const install = spawnSync("bun", ["install"], { cwd: ROOT, stdio: "inherit" });
if (install.status !== 0) fail("`bun install` failed, so bun.lock was not regenerated");

const stale = [...readLockfileVersions()].filter(([, locked]) => locked !== version);
if (stale.length > 0) {
  fail(`bun.lock still records ${stale.map(([name, at]) => `${name}@${at}`).join(", ")}`);
}

if (!useGit) {
  console.log(`\nSet ${manifests.length} manifests and bun.lock to ${version}. Left uncommitted (--no-git).`);
  process.exit(0);
}

git(["add", "bun.lock", ...manifests.map((path) => relative(ROOT, path))]);
git(["commit", "-m", `release: ${tag}`]);
git(["tag", "-a", tag, "-m", tag]);

console.log(`\nCommitted and tagged ${tag}.`);
console.log(`Push it to publish:  git push --follow-tags`);

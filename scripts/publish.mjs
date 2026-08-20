#!/usr/bin/env bun
// Publish every workspace package to npm, dependencies first.
//
//   bun scripts/publish.mjs                 publish under the "latest" dist-tag
//   bun scripts/publish.mjs --tag=next      publish under a different dist-tag
//   bun scripts/publish.mjs --provenance    attest the build (CI only)
//   bun scripts/publish.mjs --dry-run       pack and validate, upload nothing
//
// Packing and uploading are deliberately split between two tools:
//
//   bun packs   — it rewrites the `workspace:^` ranges between our packages
//                 into real semver ranges. npm does not; it would ship
//                 `workspace:^` verbatim and the result would not install.
//   npm uploads — it supports --provenance, which bun has no flag for. Given a
//                 prebuilt tarball it just reads the manifest inside, so none
//                 of npm's workspace handling is involved.
//
// Versions already on the registry are skipped rather than treated as an
// error, so a release that fails halfway can simply be re-run.

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { publishOrder, readPackages } from "./workspace.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const provenance = args.includes("--provenance");
const distTag = args.find((arg) => arg.startsWith("--tag="))?.slice("--tag=".length) || "latest";

function run(command, commandArgs, cwd) {
  const result = spawnSync(command, commandArgs, { cwd, stdio: "inherit" });
  return result.status === 0;
}

async function isAlreadyPublished(name, version) {
  const response = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2f")}`, {
    headers: { accept: "application/vnd.npm.install-v1+json" },
  });
  if (response.status === 404) return false; // never published under this name
  if (!response.ok) {
    throw new Error(`registry lookup for ${name} failed: ${response.status} ${response.statusText}`);
  }
  const packument = await response.json();
  return Boolean(packument.versions?.[version]);
}

const packages = publishOrder(readPackages());
console.log(`dist-tag:   ${distTag}${dryRun ? "  (dry run)" : ""}`);
console.log(`provenance: ${provenance ? "on" : "off"}`);
console.log(`order:      ${packages.map((pkg) => pkg.name).join(" -> ")}\n`);

const staging = mkdtempSync(join(tmpdir(), "watchtower-release-"));
const published = [];
const skipped = [];

try {
  for (const pkg of packages) {
    const id = `${pkg.name}@${pkg.version}`;

    if (await isAlreadyPublished(pkg.name, pkg.version)) {
      console.log(`skip    ${id}  (already on the registry)`);
      skipped.push(id);
      continue;
    }

    console.log(`pack    ${id}`);
    const packInto = mkdtempSync(join(staging, "pkg-"));
    if (!run("bun", ["pm", "pack", "--destination", packInto], pkg.dir)) {
      console.error(`\nerror: packing ${id} failed.`);
      process.exit(1);
    }

    const [tarball] = readdirSync(packInto).filter((file) => file.endsWith(".tgz"));
    if (tarball === undefined) {
      console.error(`\nerror: packing ${id} produced no tarball.`);
      process.exit(1);
    }

    const publishArgs = [
      "publish",
      join(packInto, tarball),
      "--access",
      "public",
      "--tag",
      distTag,
    ];
    if (provenance) publishArgs.push("--provenance");
    if (dryRun) publishArgs.push("--dry-run");

    console.log(`publish ${id}`);
    if (!run("npm", publishArgs, pkg.dir)) {
      console.error(`\nerror: publishing ${id} failed.`);
      if (published.length > 0) {
        console.error(`Already published this run: ${published.join(", ")}`);
        console.error("Re-running this release will skip those and resume from here.");
      }
      process.exit(1);
    }
    published.push(id);
  }
} finally {
  rmSync(staging, { recursive: true, force: true });
}

console.log(
  `\n${dryRun ? "Dry run complete." : "Published."}  ` +
    `${published.length} package(s)${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}.`,
);

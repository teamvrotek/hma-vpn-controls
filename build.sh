#!/bin/bash
# Build the macOS helper and package a validated installer from the checked-in assets.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

PLUGIN_NAME="com.teamvrotek.hmacontrols"
PLUGIN_DIR="$PLUGIN_NAME.sdPlugin"
PROJECT_DIR="$(pwd)"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

npm ci --ignore-scripts --silent
npm ci --prefix "$PLUGIN_DIR" --omit=dev --ignore-scripts --silent
bash native/build.sh "$PROJECT_DIR/$PLUGIN_DIR/bin/hma-bridge"

mkdir -p Release
cp -R "$PLUGIN_DIR" "$BUILD_DIR/$PLUGIN_DIR"
cp LICENSE "$BUILD_DIR/$PLUGIN_DIR/LICENSE"
./node_modules/.bin/streamdeck pack "$BUILD_DIR/$PLUGIN_DIR" --output "$BUILD_DIR" --force --no-file-list

# The CLI pads versions to four parts. Preserve the project's release version.
node --input-type=module - "$PLUGIN_DIR/manifest.json" "$BUILD_DIR/$PLUGIN_DIR/manifest.json" <<'MANIFEST'
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const [sourcePath, stagedPath] = process.argv.slice(2);
const sourceBytes = readFileSync(sourcePath);
const source = JSON.parse(sourceBytes.toString("utf8"));
const staged = JSON.parse(readFileSync(stagedPath, "utf8"));
if (!/^\d+\.\d+$/.test(source.Version)) {
    throw new Error("Use a two-part release version, such as 1.0.");
}
staged.Version = source.Version;
if (!isDeepStrictEqual(staged, source)) throw new Error("Packaging changed unexpected manifest fields.");
writeFileSync(stagedPath, sourceBytes);
console.log(`Preserved release manifest Version ${source.Version}.`);
MANIFEST

PACKAGE_PATH="$BUILD_DIR/$PLUGIN_NAME.streamDeckPlugin"
# Elgato's packer drops executable permissions. Restore the helper entry with system zip.
chmod 755 "$BUILD_DIR/$PLUGIN_DIR/bin/hma-bridge"
(
    cd "$BUILD_DIR"
    zip -q "$PACKAGE_PATH" "$PLUGIN_DIR/manifest.json" "$PLUGIN_DIR/bin/hma-bridge"
)
zip -T "$PACKAGE_PATH"
node --input-type=module - "$PACKAGE_PATH" "$PROJECT_DIR/$PLUGIN_DIR" "$PROJECT_DIR" <<'NODE'
import { execFileSync } from "node:child_process";
import { cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

const [packageArgument, sourceArgument, projectArgument] = process.argv.slice(2);
const packagePath = resolve(packageArgument);
const sourcePath = resolve(sourceArgument);
const projectPath = resolve(projectArgument);
const pluginName = basename(sourcePath);
const temporaryPath = mkdtempSync(join(tmpdir(), "hma-package-check-"));

function filesIn(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Unexpected symbolic link in package: ${path}`);
        return entry.isDirectory() ? filesIn(path) : [path];
    });
}

try {
    const entries = execFileSync("/usr/bin/unzip", ["-Z", "-1", packagePath], { encoding: "utf8" }).trim().split("\n");
    for (const entry of entries) {
        if (!entry.startsWith(`${pluginName}/`) || entry.split("/").includes("..") || entry.includes("\\")) {
            throw new Error(`Unexpected package path: ${entry}`);
        }
    }
    execFileSync("/usr/bin/unzip", ["-q", packagePath, "-d", temporaryPath]);
    const extractedPlugin = join(temporaryPath, pluginName);
    const files = filesIn(extractedPlugin);
    for (const extractedPath of files) {
        const entry = relative(extractedPlugin, extractedPath);
        const sourceFile = entry === "LICENSE" ? join(projectPath, "LICENSE") : join(sourcePath, entry);
        if (!lstatSync(extractedPath).isFile() || !lstatSync(sourceFile).isFile()) {
            throw new Error(`Packaged ${entry} is not a regular source file.`);
        }
        const packagedBytes = readFileSync(extractedPath);
        const sourceBytes = readFileSync(sourceFile);
        if (!packagedBytes.equals(sourceBytes)) throw new Error(`Packaged ${entry} does not match the source.`);
    }
    const helper = lstatSync(join(extractedPlugin, "bin/hma-bridge"));
    if (!(helper.mode & 0o100)) throw new Error("Packaged HMA helper is missing owner execute permission.");
    for (const entry of ["LICENSE", "ui/property-inspector.html", "ui/property-inspector.css", "ui/property-inspector.js"]) {
        if (!lstatSync(join(extractedPlugin, entry)).isFile()) throw new Error(`Missing packaged ${entry}.`);
    }
    // The CLI schema requires four parts. Check a separate copy, leaving the shipped manifest untouched.
    const schemaPlugin = join(temporaryPath, "schema", pluginName);
    cpSync(extractedPlugin, schemaPlugin, { recursive: true });
    const schemaManifestPath = join(schemaPlugin, "manifest.json");
    const manifest = JSON.parse(readFileSync(schemaManifestPath, "utf8"));
    const releaseVersion = manifest.Version;
    const versionParts = releaseVersion.split(".");
    while (versionParts.length < 4) versionParts.push("0");
    manifest.Version = versionParts.join(".");
    writeFileSync(schemaManifestPath, JSON.stringify(manifest, null, 2) + "\n");
    console.log(`Schema compatibility check on an isolated copy: Version ${releaseVersion} normalized to ${manifest.Version}.`);
    execFileSync(join(projectPath, "node_modules/.bin/streamdeck"), ["validate", schemaPlugin, "--no-update-check"], { stdio: "inherit" });
    // Import the shipped module graph without registering a key or controlling HMA.
    execFileSync(process.execPath, ["--input-type=module", "-e",
        "await import('@elgato/streamdeck'); await import('./controller.js'); await import('./bridge.js');"],
    { cwd: extractedPlugin, timeout: 10000, stdio: "pipe" });
    console.log(`Verified ${files.length} packaged files, exact release manifest, schema compatibility, runtime imports and executable helper.`);
} finally {
    rmSync(temporaryPath, { recursive: true, force: true });
}
NODE
mv "$PACKAGE_PATH" "$PROJECT_DIR/Release/$PLUGIN_NAME.streamDeckPlugin"
echo "Built Release/$PLUGIN_NAME.streamDeckPlugin"

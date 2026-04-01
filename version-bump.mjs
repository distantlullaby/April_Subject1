import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;

// read manifest.json to figure out what to set the version to
let manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const manifestVersion = manifest.version;

console.log("Current version:", manifestVersion);
console.log("Setting version to:", targetVersion);

manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t"));

// update versions.json with target version and minAppVersion from manifest.json
let versions = {};
try {
	versions = JSON.parse(readFileSync("versions.json", "utf8"));
} catch (e) {
	// do nothing
}

versions[targetVersion] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t"));

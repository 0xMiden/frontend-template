#!/usr/bin/env node
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fsp.copyFile(s, d);
  }
}

async function main() {
  const projectName = process.argv[2] || "miden-app";
  const targetDir = path.resolve(process.cwd(), projectName);
  const templateDir = path.join(__dirname, "template");

  if (fs.existsSync(targetDir)) {
    console.error(`Directory '${projectName}' already exists.`);
    process.exit(1);
  }

  console.log(`Creating project ${projectName}...`);
  await copyDir(templateDir, targetDir);

  const pkgFile = path.join(targetDir, "package.json");
  if (fs.existsSync(pkgFile)) {
    const pkg = JSON.parse(await fsp.readFile(pkgFile, "utf8"));
    pkg.name = projectName;
    await fsp.writeFile(pkgFile, JSON.stringify(pkg, null, 2));
  }

  console.log(`
Done!

Next steps:
  cd ${projectName}
  yarn install
  yarn dev
`);
}

main();

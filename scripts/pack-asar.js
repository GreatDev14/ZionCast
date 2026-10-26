const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');

async function pack() {
  const root = path.resolve(__dirname, '..');
  const stage = path.join(root, '.build_staging');
  const destAsar = path.join(root, 'dist', 'win-unpacked', 'resources', 'app.asar');

  if (fs.existsSync(stage)) {
    fs.rmSync(stage, { recursive: true, force: true });
  }
  fs.mkdirSync(stage, { recursive: true });

  const coreFiles = [
    'main.js',
    'preload.js',
    'index.html',
    'display.html',
    'styles.css',
    'renderer.js',
    'display.js',
    'package.json'
  ];

  for (const f of coreFiles) {
    const src = path.join(root, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(stage, f));
    }
  }

  function copyDirRecursive(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  const assetsDir = path.join(root, 'assets');
  if (fs.existsSync(assetsDir)) {
    copyDirRecursive(assetsDir, path.join(stage, 'assets'));
  }

  fs.mkdirSync(path.dirname(destAsar), { recursive: true });
  await asar.createPackage(stage, destAsar);

  fs.rmSync(stage, { recursive: true, force: true });
  console.log('✓ Successfully packed latest ZionCast files into dist/win-unpacked/resources/app.asar');
}

pack().catch((err) => {
  console.error('Packaging error:', err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const VIEWS = path.join(ROOT, 'views');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

// Keep in sync with server.js routes
const ROUTES = [
  { view: 'index', out: 'index.html' },
  { view: 'demo', out: path.join('demo', 'index.html') },
];

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function renderPage(name) {
  return ejs.renderFile(path.join(VIEWS, `${name}.ejs`), {}, {
    root: VIEWS,
    filename: path.join(VIEWS, `${name}.ejs`),
  });
}

async function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.cpSync(PUBLIC, DIST, { recursive: true });

  for (const { view, out } of ROUTES) {
    writeFile(path.join(DIST, out), await renderPage(view));
  }

  console.log(`Wrote static site to dist/ (${ROUTES.map((r) => r.view).join(', ')})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

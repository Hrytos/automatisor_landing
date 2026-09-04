const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const ROOT = path.join(__dirname, '..');
const VIEWS = path.join(ROOT, 'views');
const PUBLIC = path.join(ROOT, 'public');
const DIST = path.join(ROOT, 'dist');

const PAGES = ['sales', 'success', 'demo'];
const HOME_PERSONA = process.env.HOME_PERSONA || 'sales';

if (!PAGES.includes(HOME_PERSONA)) {
  throw new Error(`HOME_PERSONA must be one of: ${PAGES.join(', ')}`);
}

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

  for (const page of PAGES) {
    writeFile(path.join(DIST, page, 'index.html'), await renderPage(page));
  }

  // Same destination Express uses for `GET /`
  writeFile(path.join(DIST, 'index.html'), await renderPage(HOME_PERSONA));

  console.log(`Wrote static site to dist/ (home persona: ${HOME_PERSONA})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

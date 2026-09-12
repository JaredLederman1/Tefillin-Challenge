const sharp = require('sharp');
const fs = require('fs');
// Keep the approved artwork intact; center its visible bounds for each surface.
const source = fs.readFileSync('assets/logo-concepts/tefillin-45-paired-back-straps.svg', 'utf8');
const artwork = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
const svg = (background, padding) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${background ? '<rect width="1024" height="1024" fill="#000000"/>' : ''}<svg x="${padding}" y="${padding}" width="${1024-padding*2}" height="${1024-padding*2}" viewBox="20 65 720 670">${artwork}</svg></svg>`;
(async () => {
  fs.writeFileSync('assets/brand.svg', svg(false, 16));
  await sharp(Buffer.from(svg(false, 16))).png().toFile('assets/brand.png');
  await sharp(Buffer.from(svg(true, 160))).png().toFile('assets/icon.png');
  await sharp(Buffer.from(svg(false, 205))).png().toFile('assets/adaptive-icon.png');
  await sharp(Buffer.from(svg(false, 160))).png().toFile('assets/splash-icon.png');
  await sharp(Buffer.from(svg(true, 100))).resize(64,64).png().toFile('assets/favicon.png');
})().catch(error => { console.error(error); process.exitCode = 1; });

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const dir = path.resolve('assets/logo-concepts');
const blue = '#2478FF';
// Front-facing tefillin box, shin cutout, and two distinct leather straps.
const mark = `
  <path d="M330 560V646Q330 693 299 722L238 783" fill="none" stroke="${blue}" stroke-width="46" stroke-linecap="round"/>
  <path d="M694 560V663Q694 708 725 738L770 783" fill="none" stroke="${blue}" stroke-width="46" stroke-linecap="round"/>
  <path d="M343 255L402 212H625L681 255Z" fill="${blue}"/>
  <rect x="343" y="275" width="338" height="273" rx="12" fill="${blue}"/>
  <path d="M300 568H724V610H300Z" fill="${blue}"/>
  <path d="M412 334L426 450Q429 486 467 486H557Q595 486 598 450L612 334M512 334V475" fill="none" stroke="#000" stroke-width="29" stroke-linecap="square" stroke-linejoin="round"/>
`;
// Cutouts use a mask so the standalone SVG works on any background.
const transparentMark = mark.replace('stroke="#000"', 'stroke="black"');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><mask id="shin"><rect width="1024" height="1024" fill="white"/><path d="M412 334L426 450Q429 486 467 486H557Q595 486 598 450L612 334M512 334V475" fill="none" stroke="black" stroke-width="29" stroke-linecap="square" stroke-linejoin="round"/></mask></defs><g mask="url(#shin)">${mark.replace(/  <path d="M412[^\n]+\n/, '')}</g></svg>`;
(async()=>{
 fs.writeFileSync(path.join(dir,'tefillin-box-two-straps.svg'),svg);
 await sharp(Buffer.from(svg)).png().toFile(path.join(dir,'tefillin-box-two-straps-transparent.png'));
 await sharp({create:{width:1024,height:1024,channels:4,background:'#000000'}}).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(dir,'tefillin-box-two-straps.png'));
 console.log(path.join(dir,'tefillin-box-two-straps.png'));
})();

const fs=require('node:fs');const sharp=require('sharp');const path=require('node:path');
const dir=path.resolve('assets/logo-concepts');const blue='#2478FF';
// Two equally visible faces establish a 45-degree box orientation.
// Straps emerge at the rear base corners and recede upward in the image.
const straps=`<path d="M359 486C301 441 270 392 289 349C308 307 288 274 236 273C179 272 126 286 89 245C70 224 60 197 53 175" fill="none" stroke="${blue}" stroke-width="35" stroke-linecap="round"/><path d="M396 466C350 414 332 372 351 327C370 282 346 244 300 218C255 192 218 202 181 176C151 155 142 119 123 98" fill="none" stroke="${blue}" stroke-width="35" stroke-linecap="round"/>`;
const box=`<path d="M305 547L512 435L719 547L512 668Z"/><path d="M305 564L502 679V718L305 603Z M522 679L719 564V603L522 718Z"/><path d="M348 337L512 243L676 337L512 432Z"/><path d="M348 359L501 447V631L348 543Z M523 447L676 359V543L523 631Z"/>`;
const letter=`<g transform="matrix(.72,-.416,0,.84,535,440)"><path d="M24 24L33 123Q35 146 58 146H105Q128 146 130 123L139 24M82 24V137" fill="none" stroke="black" stroke-width="19" stroke-linecap="square"/></g>`;
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><mask id="shin"><rect width="1024" height="1024" fill="white"/>${letter}</mask></defs>${straps}<g fill="${blue}" mask="url(#shin)">${box}</g></svg>`;
(async()=>{fs.writeFileSync(path.join(dir,'tefillin-45-paired-back-straps.svg'),svg);await sharp(Buffer.from(svg)).png().toFile(path.join(dir,'tefillin-45-paired-back-straps-transparent.png'));await sharp({create:{width:1024,height:1024,channels:4,background:'#000'}}).composite([{input:Buffer.from(svg)}]).png().toFile(path.join(dir,'tefillin-45-paired-back-straps.png'));})();

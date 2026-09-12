const fs = require('node:fs');
const sharp = require('sharp');
const path = require('node:path');
const dir = path.resolve('assets/logo-concepts');
const blue = '#2478FF';
const concepts = [
 {id:'01-wrap',name:'WRAP',body:`
 <path d="M365 530C252 573 245 659 351 697C437 728 604 714 650 664C694 617 642 584 571 604C508 622 517 658 564 661" fill="none" stroke="${blue}" stroke-width="39" stroke-linecap="round"/>
 <path d="M314 420L506 354L696 420L508 492Z" fill="${blue}"/>
 <path d="M314 439L489 504V568L314 500Z M527 504L696 440V500L527 568Z" fill="${blue}"/>
 <path d="M364 310L510 260L653 309L509 362Z" fill="${blue}"/>
 <path d="M364 331L490 378V465L364 418Z M529 378L653 332V417L529 464Z" fill="${blue}"/>
 `},
 {id:'02-pair',name:'PAIR',body:`
 <path d="M336 517C233 600 264 687 386 700L595 700" fill="none" stroke="${blue}" stroke-width="35" stroke-linecap="round"/>
 <path d="M646 573C749 633 730 737 644 767" fill="none" stroke="${blue}" stroke-width="35" stroke-linecap="round"/>
 <path d="M247 378L422 317L566 374L391 440Z M247 399L371 449V522L247 472Z M410 449L566 391V464L410 522Z" fill="${blue}"/>
 <path d="M284 284L420 237L530 280L393 331Z M284 305L373 340V414L284 377Z M411 340L530 296V374L411 415Z" fill="${blue}"/>
 <path d="M465 520L627 462L772 516L610 577Z M465 541L591 590V653L465 604Z M629 590L772 536V598L629 653Z" fill="${blue}"/>
 <path d="M503 431L626 389L733 428L610 475Z M503 450L591 484V554L503 521Z M629 484L733 445V515L629 553Z" fill="${blue}"/>
 `},
 {id:'03-shin',name:'SHIN',body:`
 <path d="M313 631H711" fill="none" stroke="${blue}" stroke-width="42" stroke-linecap="square"/>
 <rect x="353" y="297" width="318" height="299" rx="23" fill="${blue}"/>
 <path d="M416 376L430 486Q434 518 464 518H566Q596 518 600 486L614 376 M514 376V510" fill="none" stroke="#000" stroke-width="27" stroke-linecap="square"/>
 <path d="M386 651C314 680 322 751 393 766C462 780 518 752 512 711" fill="none" stroke="${blue}" stroke-width="34" stroke-linecap="round"/>
 `},
];
const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;
(async()=>{
 for(const c of concepts){
  fs.writeFileSync(path.join(dir,c.id+'.svg'),svg(c.body));
  await sharp(Buffer.from(svg(`<rect width="1024" height="1024" fill="#000"/>${c.body}`))).png().toFile(path.join(dir,c.id+'.png'));
 }
 const body = `<rect width="1536" height="850" fill="#000"/>
 <text x="64" y="77" fill="${blue}" font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="700">Tefillin Challenge</text>
 <path d="M64 108H1472" stroke="#22252C"/>
 ${concepts.map((c,i)=>`<g transform="translate(${i*480+48} 105) scale(.46)">${c.body}</g>
 <text x="${i*480+84}" y="630" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="21" font-weight="700">0${i+1} / ${c.name}</text>
 <g transform="translate(${i*480+365} 594) scale(.075)"><rect width="1024" height="1024" rx="220" fill="#111216"/>${c.body}</g>`).join('')}
 <text x="64" y="784" fill="#777E8A" font-family="Arial, Helvetica, sans-serif" font-size="19">TEFILLIN CHALLENGE</text><text x="1472" y="784" text-anchor="end" fill="${blue}" font-family="Arial, Helvetica, sans-serif" font-size="19">#2478FF</text>`;
 await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="850" viewBox="0 0 1536 850">${body}</svg>`)).png().toFile(path.join(dir,'logo-directions.png'));
 console.log(path.join(dir,'logo-directions.png'));
})();

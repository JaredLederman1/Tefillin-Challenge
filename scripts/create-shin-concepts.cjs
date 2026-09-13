const fs = require('node:fs');
const sharp = require('sharp');
const path = require('node:path');
const dir = path.resolve('assets/logo-concepts');
const blue = '#2478FF';
// Custom geometric logo lettering, not a depiction of ritual scribal lettering.
const shin = `<path d="M-118-118L-100 70Q-97 118-48 118H48Q97 118 100 70L118-118M0-118V106" fill="none" stroke="${blue}" stroke-width="38" stroke-linecap="square" stroke-linejoin="round"/>`;
const four = `<path d="M-143-118L-126 70Q-123 118-75 118H75Q123 118 126 70L143-118M-46-118V108M46-118V108" fill="none" stroke="${blue}" stroke-width="33" stroke-linecap="square" stroke-linejoin="round"/>`;
const concepts = [
 {id:'shin-01',name:'THE LETTER',body:`<g transform="translate(256 251)">${shin}</g>`},
 {id:'shin-02',name:'THE BOX',body:`<rect x="98" y="80" width="316" height="316" rx="30" fill="${blue}"/><path d="M157 155L172 288Q175 326 211 326H301Q337 326 340 288L355 155M256 155V315" fill="none" stroke="#000" stroke-width="29" stroke-linecap="square"/><path d="M74 423H438" stroke="${blue}" stroke-width="22"/>`},
 {id:'shin-03',name:'THE STRAP',body:`<path d="M144 105L158 259Q161 299 201 299H292Q332 299 335 259L350 105M247 105V289" fill="none" stroke="${blue}" stroke-width="33" stroke-linecap="square"/><path d="M184 297C118 325 101 377 158 404C204 426 312 424 353 389C388 358 360 335 326 348" fill="none" stroke="${blue}" stroke-width="27" stroke-linecap="round"/>`},
 {id:'shin-04',name:'FOUR BRANCHES',body:`<g transform="translate(256 251)">${four}</g>`},
 {id:'shin-05',name:'HEAD TEFILLIN',body:`<path d="M115 136L260 88L406 136L260 186Z" fill="${blue}"/><path d="M115 157L244 202V355L115 308Z" fill="${blue}"/><path d="M267 202L406 156V308L267 355Z" fill="${blue}"/><path d="M282 227L288 289Q290 304 304 299L369 276Q382 272 383 259L389 193M337 209V287" fill="none" stroke="#000" stroke-width="15"/><path d="M98 332L256 386L424 329V356L256 413L98 359Z" fill="${blue}"/>`},
 {id:'shin-06',name:'BOUND TOGETHER',body:`<path d="M135 133L151 287Q155 330 196 330H290Q332 330 336 287L352 133M246 133V319" fill="none" stroke="${blue}" stroke-width="34" stroke-linecap="square"/><rect x="202" y="87" width="87" height="87" rx="5" fill="${blue}"/><path d="M190 192H302" stroke="${blue}" stroke-width="17"/><path d="M172 365H323M193 399H302" stroke="${blue}" stroke-width="18" stroke-linecap="round"/>`},
];
const svg = body=>`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${body}</svg>`;
(async()=>{
 for(const c of concepts){
  fs.writeFileSync(path.join(dir,c.id+'.svg'),svg(c.body));
  await sharp(Buffer.from(svg(`<rect width="512" height="512" fill="#000"/>${c.body}`))).png().toFile(path.join(dir,c.id+'.png'));
 }
 const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1220" viewBox="0 0 1536 1220"><rect width="1536" height="1220" fill="#000"/>
 <text x="64" y="77" fill="${blue}" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="700">Ratzon</text><path d="M64 108H1472" stroke="#22252C"/>
 ${concepts.map((c,i)=>{const x=64+(i%3)*496,y=147+Math.floor(i/3)*493;return `<g transform="translate(${x+50} ${y}) scale(.68)">${c.body}</g><text x="${x+15}" y="${y+382}" fill="#fff" font-family="Arial,Helvetica,sans-serif" font-size="19" font-weight="700">0${i+1} / ${c.name}</text><g transform="translate(${x+349} ${y+341}) scale(.12)"><rect width="512" height="512" rx="112" fill="#13151A"/>${c.body}</g>`}).join('')}
 <text x="64" y="1170" fill="#777E8A" font-family="Arial,Helvetica,sans-serif" font-size="18">SHIN / TEFILLIN</text><text x="1472" y="1170" text-anchor="end" fill="${blue}" font-family="Arial,Helvetica,sans-serif" font-size="18">#2478FF</text></svg>`;
 await sharp(Buffer.from(sheet)).png().toFile(path.join(dir,'shin-directions.png'));
})();

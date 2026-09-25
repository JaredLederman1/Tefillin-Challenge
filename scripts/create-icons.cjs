const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Supplied artwork is the source of truth. Trim transparent margins only.
(async () => {
  const root = path.join(__dirname, '..');
  const asset = name => path.join(root, 'assets', name);
  for (const name of ['logo', 'word-mark', 'word-mark-without-r']) {
    await sharp(asset(`media/${name}.png`)).trim().png().toFile(asset(`media/${name}-trimmed.png`));
  }
  const logo = asset('media/logo-trimmed.png');
  await sharp(logo).resize(512, 512, { fit: 'contain', background: '#00000000' }).png().toFile(asset('brand.png'));
  await sharp(asset('media/app-cover.png')).resize(1024,1024).png().toFile(asset('icon.png'));
  await sharp(logo).resize(640,640,{fit:'contain',background:'#00000000'}).extend({top:192,bottom:192,left:192,right:192,background:'#00000000'}).png().toFile(asset('adaptive-icon.png'));
  await sharp(logo).resize(240,240,{fit:'contain',background:'#00000000'}).png().toFile(asset('splash-icon.png'));
  await sharp(logo).resize(64,64,{fit:'contain',background:'#00000000'}).png().toFile(asset('favicon.png'));
  fs.copyFileSync(asset('adaptive-icon.png'),asset('android-icon-foreground.png'));
  await sharp({create:{width:1024,height:1024,channels:3,background:'#EDF4FF'}}).png().toFile(asset('android-icon-background.png'));
  // A single-color silhouette retains transparency for Android themed icons.
  await sharp(asset('adaptive-icon.png')).linear([0,0,0,1],[255,255,255,0]).png().toFile(asset('android-icon-monochrome.png'));
  fs.mkdirSync(path.join(root,'website/media'),{recursive:true});
  for (const name of ['logo','word-mark','word-mark-without-r']) {
    await sharp(asset(`media/${name}-trimmed.png`)).resize({width:name==='logo'?800:1600,withoutEnlargement:true}).png().toFile(path.join(root,`website/media/${name}.png`));
  }
  fs.copyFileSync(asset('favicon.png'),path.join(root,'website/media/favicon.png'));
  await sharp(asset('media/app-cover.png')).resize(800,800).png().toFile(path.join(root,'website/media/app-cover.png'));
})().catch(error => { console.error(error); process.exitCode = 1; });

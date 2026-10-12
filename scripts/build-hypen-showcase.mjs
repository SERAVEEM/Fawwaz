import sharp from 'sharp';
import fs from 'fs';

async function build() {
  const width = 1400;
  const height = 900;

  // Phone screen dimensions on composite
  const phoneW = 380;
  const phoneH = 780;
  const r = 32;

  // Mask with rounded corners
  const maskSvg = Buffer.from(
    `<svg width="${phoneW}" height="${phoneH}"><rect x="0" y="0" width="${phoneW}" height="${phoneH}" rx="${r}" ry="${r}" fill="white"/></svg>`
  );

  async function preparePhone(srcPath) {
    const resized = await sharp(srcPath)
      .resize(phoneW, phoneH, { fit: 'cover', position: 'top' })
      .toBuffer();

    return await sharp(resized)
      .composite([{ input: maskSvg, blend: 'dest-in' }])
      .toBuffer();
  }

  const phone1 = await preparePhone('public/assets/hypen/page_21_0_X144.jpg');
  const phone2 = await preparePhone('public/assets/hypen/page_22_4_X152.jpg');
  const phone3 = await preparePhone('public/assets/hypen/page_24_3_X175.jpg');

  // Background SVG with subtle glow and frames
  const bgSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="grad" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stop-color="#16181b" />
          <stop offset="100%" stop-color="#08090a" />
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#grad)" />
    </svg>
  `);

  await sharp(bgSvg)
    .composite([
      { input: phone1, top: 70, left: 110 },
      { input: phone3, top: 70, left: 910 },
      { input: phone2, top: 50, left: 510 },
    ])
    .webp({ quality: 92 })
    .toFile('public/webp/hypen-showcase.webp');

  console.log('Composite created at public/webp/hypen-showcase.webp');

  fs.copyFileSync('public/webp/hypen-showcase.webp', 'public/assets/hypen-hero.webp');
  console.log('Copied to public/assets/hypen-hero.webp');

  // Generate LQIP
  const blur = await sharp('public/webp/hypen-showcase.webp')
    .resize(20, null, { withoutEnlargement: true })
    .blur(2)
    .webp({ quality: 30 })
    .toBuffer();
  const lqip = 'data:image/webp;base64,' + blur.toString('base64');

  const placeholdersPath = 'src/data/placeholders.json';
  if (fs.existsSync(placeholdersPath)) {
    const data = JSON.parse(fs.readFileSync(placeholdersPath, 'utf8'));
    data['/assets/hypen-hero.webp'] = lqip;
    data['/webp/hypen-showcase.webp'] = lqip;
    fs.writeFileSync(placeholdersPath, JSON.stringify(data, null, 2));
    console.log('Updated placeholders.json');
  }
}

build().catch(console.error);

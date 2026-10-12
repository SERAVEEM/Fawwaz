import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// 1. Read .env file manually (zero extra dependencies)
function loadEnv() {
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let val = match[2].trim();
      // Remove trailing comments
      const commentIdx = val.indexOf('#');
      if (commentIdx > 0 && (val.startsWith('"') || val.startsWith("'"))) {
        // If quoted, match closing quote
        const quote = val[0];
        const closeQuote = val.indexOf(quote, 1);
        if (closeQuote > 0) val = val.substring(1, closeQuote);
      } else if (commentIdx > 0) {
        val = val.substring(0, commentIdx).trim();
      }
      val = val.replace(/^["']|["']$/g, '');
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const accountId = env.R2_ACCOUNT_ID;
const accessKeyId = env.R2_ACCESS_KEY_ID;
const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
const bucketName = env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
  console.error('Missing required R2 credentials in .env');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const MIME_TYPES = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon',
};

// Traverse directory recursively
function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

async function run() {
  console.log('🚀 Starting asset optimization & Cloudflare R2 upload...');
  const dirs = ['public/assets', 'public/webp'];
  const placeholders = {};
  const uploadTasks = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    const files = getAllFiles(dir);

    for (const filePath of files) {
      const ext = path.extname(filePath).toLowerCase();
      const relativeToPublic = path.relative('public', filePath).replace(/\\/g, '/');
      const normalizedKey = relativeToPublic;

      // Handle images (PNG, JPG, JPEG, WEBP)
      if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
        try {
          const inputBuffer = fs.readFileSync(filePath);
          
          // Generate 20px blurred base64 placeholder (LQIP)
          const blurBuffer = await sharp(inputBuffer)
            .resize(20, null, { withoutEnlargement: true })
            .blur(2)
            .webp({ quality: 30 })
            .toBuffer();
          const base64Placeholder = `data:image/webp;base64,${blurBuffer.toString('base64')}`;
          
          // Store for both original path and webp path
          placeholders[`/${normalizedKey}`] = base64Placeholder;

          let uploadBuffer = inputBuffer;
          let uploadKey = normalizedKey;
          let contentType = MIME_TYPES[ext] || 'application/octet-stream';

          // If PNG or JPG, create an optimized WebP version
          if (['.png', '.jpg', '.jpeg'].includes(ext)) {
            const webpBuffer = await sharp(inputBuffer)
              .webp({ quality: 85, effort: 4 })
              .toBuffer();

            const webpKey = normalizedKey.replace(/\.(png|jpg|jpeg)$/i, '.webp');
            placeholders[`/${webpKey}`] = base64Placeholder;

            // Save optimized WebP locally as well for fallback
            const localWebpPath = filePath.replace(/\.(png|jpg|jpeg)$/i, '.webp');
            fs.writeFileSync(localWebpPath, webpBuffer);

            // Queue optimized WebP upload
            uploadTasks.push({
              key: webpKey,
              buffer: webpBuffer,
              contentType: 'image/webp',
              originalSize: inputBuffer.length,
              optimizedSize: webpBuffer.length,
            });

            console.log(`✨ Optimized ${normalizedKey} (${Math.round(inputBuffer.length / 1024)}KB -> ${Math.round(webpBuffer.length / 1024)}KB WebP)`);
          }

          // Also upload original to maintain compatibility
          uploadTasks.push({
            key: uploadKey,
            buffer: uploadBuffer,
            contentType,
            originalSize: inputBuffer.length,
            optimizedSize: uploadBuffer.length,
          });
        } catch (err) {
          console.warn(`Could not process image ${filePath}:`, err.message);
          // Fallback raw upload
          uploadTasks.push({
            key: normalizedKey,
            buffer: fs.readFileSync(filePath),
            contentType: MIME_TYPES[ext] || 'application/octet-stream',
          });
        }
      } else {
        // Videos & SVGs
        uploadTasks.push({
          key: normalizedKey,
          buffer: fs.readFileSync(filePath),
          contentType: MIME_TYPES[ext] || 'application/octet-stream',
        });
      }
    }
  }

  // Save placeholders to src/data/placeholders.json
  const dataDir = path.resolve('src/data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, 'placeholders.json'),
    JSON.stringify(placeholders, null, 2),
    'utf-8'
  );
  console.log(`📦 Generated ${Object.keys(placeholders).length} inlined LQIP placeholders into src/data/placeholders.json`);

  // Upload to R2 in parallel batches
  console.log(`☁️ Uploading ${uploadTasks.length} assets to Cloudflare R2 bucket: ${bucketName}...`);
  const BATCH_SIZE = 5;
  let completed = 0;

  for (let i = 0; i < uploadTasks.length; i += BATCH_SIZE) {
    const batch = uploadTasks.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (task) => {
        const cmd = new PutObjectCommand({
          Bucket: bucketName,
          Key: task.key,
          Body: task.buffer,
          ContentType: task.contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        });
        await s3.send(cmd);
        completed++;
        console.log(`[${completed}/${uploadTasks.length}] Uploaded: ${task.key} (${task.contentType})`);
      })
    );
  }

  console.log('🎉 All assets successfully optimized and uploaded to R2!');
}

run().catch((err) => {
  console.error('Error running optimization and upload:', err);
  process.exit(1);
});

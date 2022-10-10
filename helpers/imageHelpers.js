import sharp from 'sharp';
import { S3 } from 'aws-sdk';
import { halfPage, wideSkyscraper, largeRectangle, fullBanner, leaderboard, halfBanner } from './defaultBanners';

const fs = require('fs').promises;

const s3 = new S3();
const tmpPath = '/tmp/bannerset';
const defaultBanners = { halfPage, wideSkyscraper, largeRectangle, fullBanner, leaderboard, halfBanner };
const resize = {
  halfPage: { width: 300, height: 600 },
  wideSkyscraper: { width: 130, height: 488 },
  largeRectangle: { width: 470, height: 391 },
  fullBanner: { width: 470, height: 60 },
  leaderboard: { width: 630, height: 77 },
  halfBanner: { width: 960, height: 246 },
};

const extend = {
  halfPage: { left: 0, right: 660, top: 0, bottom: 284 },
  wideSkyscraper: { left: 330, right: 500, top: 0, bottom: 396 },
  largeRectangle: { left: 490, right: 0, top: 0, bottom: 493 },
  fullBanner: { left: 490, right: 0, top: 428, bottom: 396 },
  leaderboard: { left: 330, right: 0, top: 523, bottom: 284 },
  halfBanner: { left: 0, right: 0, top: 638, bottom: 0 },
};

const background = { r: 0, g: 0, b: 0, alpha: 0 };

const formatForComposite = (data, key) =>
  sharp(data)
    .resize(resize[key])
    .extend({ ...extend[key], background })
    .sharpen()
    .png()
    .toBuffer();

export const processImage = async (data, srcBucket, objKey, metadata = {}) => {
  const { sizes, validsize } = metadata;

  if (!sizes) {
    return sharp(data)
      .resize({ width: 640 })
      .png()
      .withMetadata()
      .toBuffer();
  }

  const allSizes = ['halfPage', 'wideSkyscraper', 'largeRectangle', 'fullBanner', 'leaderboard', 'halfBanner'];
  const remainingSizes = sizes.split(',').filter(k => k !== validsize);
  const missingSizes = allSizes.filter(s => !sizes.split(',').includes(s));

  await formatForComposite(data, validsize).then(buffer => fs.writeFile(`${tmpPath}-${validsize}`, buffer));

  for (const key of remainingSizes) {
    await s3
      .getObject({ Bucket: srcBucket, Key: `${objKey}-${key}` })
      .promise()
      .then(({ Body: resp }) => formatForComposite(resp, key))
      .then(buffer => fs.writeFile(`${tmpPath}-${key}`, buffer));
  }

  const composite = remainingSizes.map(key => ({ input: `${tmpPath}-${key}` }));

  for (const key of missingSizes) {
    const rawBuffer = Buffer.from(defaultBanners[key]);
    const input = await formatForComposite(rawBuffer, key);

    composite.push({ input });
  }

  await sharp(`${tmpPath}-${validsize}`)
    .composite(composite)
    .sharpen()
    .withMetadata()
    .png()
    .toBuffer()
    .then(buffer => fs.writeFile(`${tmpPath}-thumbnail-960`, buffer));

  return sharp(`${tmpPath}-thumbnail-960`)
    .resize({ width: 640 })
    .toBuffer();
};

/**
 * Mosaic Notes
 *
 * halfPage: 300x600
 * wideSkyscraper: 160x600
 * largeRectangle: 336x280
 * fullBanner: 468x60
 * leaderboard: 728x90
 * halfBanner: 234x60
 *
 * Resizes - clockwise
 * 300 x 600
 * 160 x 600 (to: 130 x 488)
 * 336 x 280 (to: 470 x 391)
 * 468 x 60 (to: 470 x 60)
 * 728 x 90 (to: 630 x 77)
 * 234 x 60 (to: 960 x 246)
 *
 * Widths (rows top to bottom)
 * (300) + 30 + (130) + 30 + (470) = 960
 * (300) + 30 + (130) + 30 + (470) = 960
 * (300) + 30 + (630) = 960
 * (960) = 960
 *
 * Heights (cols left to right)
 * 38 + (600) + 38 + (246) + 38 = 960
 * 38 + (488) + 35 + (77) + 38 + (246) + 38 = 960
 * 38 + (391) + 37 + (60) + 35 + (77) + 38 + (246) + 38 = 960
 *
 */

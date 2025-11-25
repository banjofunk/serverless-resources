/**
 * Image processing helpers for creating composite banner thumbnails.
 * 
 * This module handles the creation of composite thumbnails from banner sets.
 * It resizes individual banner images to specific dimensions, positions them
 * on a canvas, and composites them into a single preview image showing all
 * banner sizes together.
 */

import sharp from 'sharp';
import { S3 } from 'aws-sdk';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { halfPage, wideSkyscraper, largeRectangle, fullBanner, leaderboard, halfBanner } from './defaultBanners';

const s3 = new S3();
const tmpPath = path.join(os.tmpdir(), 'bannerset');
const defaultBanners = { halfPage, wideSkyscraper, largeRectangle, fullBanner, leaderboard, halfBanner };

/**
 * Target dimensions for resizing each banner size.
 * These are scaled-down versions of the standard IAB banner dimensions
 * to fit within the composite thumbnail layout.
 */
const resize = {
  halfPage: { width: 300, height: 600 },
  wideSkyscraper: { width: 130, height: 488 },
  largeRectangle: { width: 470, height: 391 },
  fullBanner: { width: 470, height: 60 },
  leaderboard: { width: 630, height: 77 },
  halfBanner: { width: 960, height: 246 },
};

/**
 * Padding/extension values for positioning each banner in the composite layout.
 * These values create spacing around each banner to position them correctly
 * on the 960px wide canvas. Values represent pixels to add on each side.
 */
const extend = {
  halfPage: { left: 0, right: 660, top: 0, bottom: 284 },
  wideSkyscraper: { left: 330, right: 500, top: 0, bottom: 396 },
  largeRectangle: { left: 490, right: 0, top: 0, bottom: 493 },
  fullBanner: { left: 490, right: 0, top: 428, bottom: 396 },
  leaderboard: { left: 330, right: 0, top: 523, bottom: 284 },
  halfBanner: { left: 0, right: 0, top: 638, bottom: 0 },
};

/** Transparent background color for extended areas */
const background = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Formats an image buffer for composite operation.
 * Resizes and extends the image to fit the target dimensions.
 *
 * @param {Buffer} data - The image buffer.
 * @param {string} key - The banner size key (e.g., 'halfPage').
 * @returns {Promise<Buffer>} - The processed image buffer.
 */
const formatForComposite = (data, key) =>
  sharp(data)
    .resize(resize[key])
    .extend({ ...extend[key], background })
    .sharpen()
    .png()
    .toBuffer();

/**
 * Processes an image to create a composite thumbnail or a resized version.
 *
 * @param {Buffer} data - The source image data.
 * @param {string} srcBucket - The source S3 bucket name.
 * @param {string} objKey - The source S3 object key.
 * @param {object} metadata - Metadata associated with the image.
 * @returns {Promise<Buffer>} - The final processed image buffer.
 */
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

import { S3 } from 'aws-sdk';
import { processImage } from '../helpers/imageHelpers';

const s3 = new S3();

export const handler = async event => {
  console.log(JSON.stringify(event));
  process.env.PATH = `${process.env.PATH}:${process.env.LAMBDA_TASK_ROOT}`;
  const srcBucket = event.Records[0].s3.bucket.name;
  const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  const objKey = srcKey.replace(/-[^-]+-bannerset$/, '');
  const originalKey = srcKey.replace(/-bannerset$/, '');
  const { Metadata: metadata } = await s3.headObject({ Bucket: srcBucket, Key: srcKey }).promise();
  const { Body: data, ContentType: contentType } = await s3.getObject({ Bucket: srcBucket, Key: srcKey }).promise();
  const thumbnail = await processImage(data, srcBucket, objKey, metadata);
  const { validsize: _validsize, ...thumbnailMetadata } = metadata;

  await s3
    .putObject({
      Bucket: srcBucket,
      Key: `${objKey}-thumbnail`,
      Body: thumbnail,
      Metadata: thumbnailMetadata,
      ContentType: 'image/png',
    })
    .promise();

  return s3
    .putObject({
      Bucket: srcBucket,
      Key: originalKey,
      Body: data,
      Metadata: metadata,
      ContentType: contentType,
    })
    .promise()
    .then(() => s3.deleteObject({ Bucket: srcBucket, Key: srcKey }).promise());
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

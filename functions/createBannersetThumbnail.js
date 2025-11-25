import { S3 } from 'aws-sdk';
import { processImage } from '../helpers/imageHelpers';

const s3 = new S3();

/**
 * Lambda handler to create a thumbnail from a banner set.
 *
 * @param {object} event - The Lambda event object.
 * @returns {Promise<object>} - The result of the S3 deleteObject operation.
 */
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

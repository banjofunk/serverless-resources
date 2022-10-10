import { S3 } from 'aws-sdk';
import sharp from 'sharp';

const s3 = new S3();

export const handler = async event => {
  console.log(event.Records[0].s3);
  const srcBucket = event.Records[0].s3.bucket.name;
  const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));

  const { Body: data } = await s3.getObject({ Bucket: srcBucket, Key: srcKey }).promise();

  console.log('Body', data);

  try {
    const image = sharp(data);
    const metadata = await image.metadata();
    const s3metadata = {
      sizes: 'custom',
      validsize: 'custom',
      type: `image/${metadata.format}`,
      width: `${metadata.width}`,
      height: `${metadata.height}`,
    };

    const destKey = srcKey.replace(/-original-api$/, '-custom');
    const originalDestKey = srcKey.replace('-original-api', '-original');

    await s3
      .putObject({
        Bucket: srcBucket,
        Key: destKey,
        Metadata: s3metadata,
        Body: data,
        ContentType: `image/${metadata.format}`,
      })
      .promise();

    await s3
      .putObject({
        Bucket: srcBucket,
        Key: originalDestKey,
        Metadata: s3metadata,
        Body: data,
        ContentType: `image/${metadata.format}`,
      })
      .promise()
      .then(() =>
        s3
          .deleteObject({
            Bucket: srcBucket,
            Key: srcKey,
          })
          .promise()
      );
  } catch (e) {
    if (e.toString().includes('unsupported image format')) {
      console.log(`skipping ${srcKey} - unsupported format`);
      await renameSrcObj(srcBucket, srcKey);
    } else throw e;
  }
};

const renameSrcObj = async (bucket, key) => {
  const destKey = key.replace('-original-api', '-original');

  await s3
    .copyObject({
      Bucket: bucket,
      CopySource: `${bucket}/${key}`,
      Key: destKey,
    })
    .promise()
    .then(() =>
      s3
        .deleteObject({
          Bucket: bucket,
          Key: key,
        })
        .promise()
    );
};

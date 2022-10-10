import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import qs from 'querystring';
import { S3 } from 'aws-sdk';

const s3 = new S3();

export const handler = async event => {
  console.log(event);
  const {
    getObjectContext: { outputRoute, outputToken, inputS3Url } = {},
    userRequest: { url },
  } = event;

  const [_baseUrl, queryParams] = url.split('?');
  const { 'x-amz-transform-options': transformOptions } = qs.parse(queryParams) || {};
  const { responseType = 'image', ...params } = transformOptions ? JSON.parse(transformOptions) : {};
  const axiosResponseType = responseType === 'image' ? 'arraybuffer' : 'stream';
  const { data } = await axios.get(inputS3Url, { responseType: axiosResponseType });

  let body;

  switch (responseType) {
    case 'image':
      body = await processImage(data, params);
      break;
    case 'video-thumbnail':
      body = await processVideoThumbnail(data, params);
      break;
    case 'video':
      body = await processVideo(data, params);
      break;
    default:
      body = data;
      break;
  }

  return s3
    .writeGetObjectResponse({
      RequestRoute: outputRoute,
      RequestToken: outputToken,
      Body: body,
    })
    .promise()
    .then(() => ({ statusCode: 200 }));
};

const processImage = async (data, params) => {
  const { width, height } = params;
  const size = {};

  if (height) size.height = height;
  if (width) size.width = width;
  if (!width && !height) return data;

  return sharp(data)
    .resize(size)
    .toBuffer();
};

const processVideo = async (data, params) => {
  const { width, height } = params;
  let size = '100%';

  if (height) size = `?x${height}`;
  if (width) size = `${width}x?`;
  if (width && height) size = `${width}x${height}`;

  if (!width && !height) {
    return data;
  }

  await new Promise((resolve, reject) => {
    ffmpeg(data)
      .output('/tmp/output.mp4')
      .size(size)
      .outputOption('-b:v', '512k')
      .on('error', reject)
      .on('end', resolve)
      .run();
  });

  return fs.readFileSync('/tmp/output.mp4');
};

const processVideoThumbnail = async (data, params) => {
  const { width, height } = params;
  let size = '100%';

  if (height) size = `?x${height}`;
  if (width) size = `${width}x?`;
  if (width && height) size = `${width}x${height}`;

  await new Promise((resolve, reject) => {
    ffmpeg(data)
      .output('/tmp/screenshot.png')
      .seek('0:01')
      .outputOptions('-frames', '1')
      .size(size)
      .on('error', reject)
      .on('end', resolve)
      .run();
  });

  return fs.readFileSync('/tmp/screenshot.png');
};

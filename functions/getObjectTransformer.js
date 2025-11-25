import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import sharp from 'sharp';
import fs from 'fs';
import qs from 'querystring';
import { S3 } from 'aws-sdk';
import path from 'path';
import os from 'os';

const s3 = new S3();

/**
 * Lambda handler for S3 Object Lambda.
 * Transforms objects on the fly based on query parameters.
 *
 * @param {object} event - The Lambda event object.
 * @returns {Promise<object>} - The result of the S3 writeGetObjectResponse operation.
 */
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

/**
 * Resizes an image based on parameters.
 *
 * @param {Buffer} data - The image data.
 * @param {object} params - The transformation parameters (width, height).
 * @returns {Promise<Buffer>} - The resized image buffer.
 */
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

/**
 * Transcodes a video based on parameters.
 *
 * @param {Stream} data - The video stream.
 * @param {object} params - The transformation parameters (width, height).
 * @returns {Promise<Buffer>} - The transcoded video buffer.
 */
const processVideo = async (data, params) => {
  const { width, height } = params;
  let size = '100%';
  const outputFile = path.join(os.tmpdir(), 'output.mp4');

  if (height) size = `?x${height}`;
  if (width) size = `${width}x?`;
  if (width && height) size = `${width}x${height}`;

  if (!width && !height) {
    return data;
  }

  await new Promise((resolve, reject) => {
    ffmpeg(data)
      .output(outputFile)
      .size(size)
      .outputOption('-b:v', '512k')
      .on('error', reject)
      .on('end', resolve)
      .run();
  });

  return fs.readFileSync(outputFile);
};

/**
 * Generates a thumbnail from a video.
 *
 * @param {Stream} data - The video stream.
 * @param {object} params - The transformation parameters (width, height).
 * @returns {Promise<Buffer>} - The thumbnail image buffer.
 */
const processVideoThumbnail = async (data, params) => {
  const { width, height } = params;
  let size = '100%';
  const outputFile = path.join(os.tmpdir(), 'screenshot.png');

  if (height) size = `?x${height}`;
  if (width) size = `${width}x?`;
  if (width && height) size = `${width}x${height}`;

  await new Promise((resolve, reject) => {
    ffmpeg(data)
      .output(outputFile)
      .seek('0:01')
      .outputOptions('-frames', '1')
      .size(size)
      .on('error', reject)
      .on('end', resolve)
      .run();
  });

  return fs.readFileSync(outputFile);
};

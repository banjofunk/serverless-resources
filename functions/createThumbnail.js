import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';
import { promises as fs } from 'fs';
import util from 'util';
import { exec as execCallback } from 'child_process';
import path from 'path';
import os from 'os';

const exec = util.promisify(execCallback);

const s3 = new S3();

const outputFile = path.join(os.tmpdir(), 'output');

/**
 * Lambda handler to process S3 object creation events.
 * Generates thumbnails for videos and audio files.
 *
 * @param {object} event - The Lambda event object.
 * @returns {Promise<object>} - The result of the S3 putObject operation.
 */
export const handler = async event => {
  console.log(event.Records[0].s3);
  process.env.PATH = `${process.env.PATH}:${process.env.LAMBDA_TASK_ROOT}`;
  const srcBucket = event.Records[0].s3.bucket.name;
  const srcKey = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
  const dstKey = srcKey.replace(/-original$/, '-thumbnail');
  const { Metadata: metadata } = await s3.headObject({ Bucket: srcBucket, Key: srcKey }).promise();

  const { Body: data, ContentType: contentType } = await s3.getObject({ Bucket: srcBucket, Key: srcKey }).promise();
  const [rootType] = contentType.split('/');

  let body;

  switch (rootType) {
    case 'video':
      console.log('processVideo');
      body = await processVideo(data);
      break;
    case 'audio':
      console.log('processAudio');
      body = await processAudio(data, metadata);
      break;
    default:
      body = data;
      break;
  }

  return s3
    .putObject({
      Bucket: srcBucket,
      Key: dstKey,
      Body: body,
      Metadata: metadata,
      ContentType: 'image/png',
    })
    .promise();
};

/**
 * Extracts a frame from a video stream to use as a thumbnail.
 *
 * @param {Buffer|Stream} data - The video data.
 * @returns {Promise<Buffer>} - The thumbnail image buffer.
 */
const processVideo = async data => {
  const stream = Readable.from(data);

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(stream)
      .seek('0:01')
      .size('640x?')
      .outputOptions('-frames', '1')
      .outputOptions('-f image2pipe')
      .outputOptions('-vcodec png')
      .output(outputFile)
      .on('error', reject)
      .on('end', resolve)
      .run();
  });

  return fs.readFile(outputFile);
};

/**
 * Generates a waveform visualization for an audio file.
 *
 * @param {Buffer} data - The audio data.
 * @param {object} metadata - Metadata associated with the audio file.
 * @returns {Promise<Buffer>} - The waveform image buffer.
 */
const processAudio = async (data, metadata = {}) => {
  const tmpPath = path.join(os.tmpdir(), 'audioFile');
  const { waveform } = metadata;

  if (waveform) {
    const waveformMetadata = waveform.split(',').map(str => Number(str));

    return genSvg(waveformMetadata);
  }

  await fs.writeFile(tmpPath, data);

  const duration = await getDuration(tmpPath);
  const sampleRate = await getSampleRate(tmpPath);
  const peaks = 30;
  const sampleSize = Math.round((duration * sampleRate) / peaks);
  const waveformData = await genWaveFormData(tmpPath, sampleSize);

  console.log({ duration, sampleRate, peaks: waveformData.length, sampleSize, waveformData });

  return genSvg(waveformData);
};

/**
 * Gets the sample rate of an audio file using ffprobe.
 *
 * @param {string} filePath - Path to the audio file.
 * @returns {Promise<number>} - The sample rate.
 */
const getSampleRate = async filePath => {
  const cmd = `/opt/ffmpeg/ffprobe -v error -show_streams -of json=c=0 ${filePath}`;
  const { stdout, stderr } = await exec(cmd);

  if (stderr) throw new Error(stderr);

  const { streams: [{ sample_rate: sampleRate }] = [] } = JSON.parse(stdout);

  return Math.ceil(sampleRate);
};

/**
 * Gets the duration of an audio file using ffprobe.
 *
 * @param {string} filePath - Path to the audio file.
 * @returns {Promise<number>} - The duration in seconds.
 */
const getDuration = async filePath => {
  const cmd = `\
  /opt/ffmpeg/ffprobe -v error \
    -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 \
    ${filePath}`;

  const { stdout, stderr } = await exec(cmd);

  if (stderr) throw new Error(stderr);

  return Math.ceil(stdout);
};

/**
 * Generates waveform data points from an audio file.
 *
 * @param {string} filePath - Path to the audio file.
 * @param {number} sampleSize - The number of samples to process per point.
 * @returns {Promise<number[]>} - An array of waveform data points.
 */
const genWaveFormData = async (filePath, sampleSize) => {
  const cmd = `\
  /opt/ffmpeg/ffprobe -v error -f lavfi \
  -i "amovie=${filePath},compand,asetnsamples=${sampleSize},astats=metadata=1:reset=1" \
  -show_entries frame_tags=lavfi.astats.Overall.Peak_level -of csv=p=0`;

  const { stdout, stderr } = await exec(cmd);

  if (stderr) throw new Error(stderr);

  const points = stdout.split('\n').map(itm => {
    const str = String(itm).trim();
    if (!str) return 0;
    const num = Math.round(Number(str) * 100);

    return num < 0 ? num * -1 : num;
  }).filter(n => !isNaN(n));

  return points;
};

const svgTemplate = (path, viewBox) => `\
<svg viewBox="${viewBox}" stroke="rgba(0,0,0,0.7)" stroke-linecap="round" stroke-linejoin="round" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path stroke-width="4" d="${path}" />
</svg>\
`;

/**
 * Generates an SVG image from waveform data points.
 *
 * @param {number[]} peakInputs - The waveform data points.
 * @returns {Promise<Buffer>} - The PNG image buffer.
 */
const genSvg = peakInputs => {
  const MAX_HEIGHT = 400;
  const STROKE_WIDTH = 4;
  const POINT_SPACING = 40;
  const PADDING = 50;
  const ARC_RADIUS = 10;

  const yScale = MAX_HEIGHT / Math.max(...peakInputs);
  const peaks = peakInputs.map(p => Math.round(p * yScale));
  const vw = peaks.length * POINT_SPACING + (PADDING * 2);
  const vh = Math.max(...peaks) * 2;
  const center = vh / 2 + PADDING;
  const viewBox = `0 0 ${vw} ${vh + 100}`;
  const path = peaks
    .map((peak, idx) => {
      const startX = idx * POINT_SPACING + PADDING;
      const endX = idx * POINT_SPACING + (PADDING + 20);
      const topY = center - peak;
      const botY = center + peak;
      const arc = `L${startX} ${topY} A${ARC_RADIUS} ${ARC_RADIUS} 0 0 1 ${endX} ${topY} L${endX} ${botY} A${ARC_RADIUS} ${ARC_RADIUS} 1 1 0 ${endX + 20} ${botY}`;

      return arc;
    })
    .join(' ');

  const start = `M0 ${center} L${PADDING} ${center}`;
  const end = `L${peakInputs.length * POINT_SPACING + PADDING} ${center}L${vw} ${center}`;
  const fullPath = `${start} ${path} ${end}`;

  const template = svgTemplate(fullPath, viewBox);
  const buffer = Buffer.from(template);

  return sharp(buffer)
    .resize({ width: 640 })
    .sharpen()
    .withMetadata()
    .png()
    .toBuffer();
};

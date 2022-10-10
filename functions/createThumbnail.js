import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { S3 } from 'aws-sdk';
import { Readable } from 'stream';

const fs = require('fs').promises;
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const s3 = new S3();

const outputFile = '/tmp/output';

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
      .output('/tmp/output')
      .on('error', reject)
      .on('end', resolve)
      .run();
  });

  return fs.readFile(outputFile);
};

const processAudio = async (data, metadata = {}) => {
  const tmpPath = '/tmp/audioFile';
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
  const waveformData = genWaveFormData(tmpPath, sampleSize);

  console.log({ duration, sampleRate, peaks: waveformData.length, sampleSize, waveformData });

  return genSvg(waveformData);
};

const getSampleRate = async filePath => {
  const cmd = `/opt/ffmpeg/ffprobe -v error -show_streams -of json=c=0 ${filePath}`;
  const { stdout, stderr } = await exec(cmd);

  if (stderr) return stderr;

  const { streams: [{ sample_rate: sampleRate }] = [] } = JSON.parse(stdout);

  return Math.ceil(sampleRate);
};

const getDuration = async filePath => {
  const cmd = `\
  /opt/ffmpeg/ffprobe -v error \
    -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 \
    ${filePath}`;

  const { stdout, stderr } = await exec(cmd);

  if (stderr) return stderr;

  return Math.ceil(stdout);
};

const genWaveFormData = async (filePath, sampleSize) => {
  const cmd = `\
  /opt/ffmpeg/ffprobe -v error -f lavfi \
  -i "amovie=${filePath},compand,asetnsamples=${sampleSize},astats=metadata=1:reset=1" \
  -show_entries frame_tags=lavfi.astats.Overall.Peak_level -of csv=p=0`;

  const { stdout, stderr } = await exec(cmd);

  if (stderr) return stderr;

  const points = stdout.split('\n').map(itm => {
    const str = String(itm).trim();
    const num = Math.round(Number(str) * 100);

    return num < 0 ? num * -1 : num;
  });

  return points;
};

const svgTemplate = (path, viewBox) => `\
<svg viewBox="${viewBox}" stroke="rgba(0,0,0,0.7)" stroke-linecap="round" stroke-linejoin="round" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path stroke-width="4" d="${path}" />
</svg>\
`;

const genSvg = peakInputs => {
  const yScale = 400 / Math.max(...peakInputs);
  const peaks = peakInputs.map(p => Math.round(p * yScale));
  const vw = peaks.length * 40 + 100;
  const vh = Math.max(...peaks) * 2;
  const center = vh / 2 + 50;
  const viewBox = `0 0 ${vw} ${vh + 100}`;
  const path = peaks
    .map((peak, idx) => {
      const startX = idx * 40 + 50;
      const endX = idx * 40 + 70;
      const topY = center - peak;
      const botY = center + peak;
      const arc = `L${startX} ${topY} A10 10 0 0 1 ${endX} ${topY} L${endX} ${botY} A10 10 1 1 0 ${endX + 20} ${botY}`;

      return arc;
    })
    .join(' ');

  const start = `M0 ${center} L50 ${center}`;
  const end = `L${peakInputs.length * 40 + 50} ${center}L${vw} ${center}`;
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

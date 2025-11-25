# Serverless Resources - S3 Object Lambda

AWS S3 Object Lambda implementation for on-the-fly image and video transformations. This project uses the Serverless Framework to manage CloudFormation templates and deploy Lambda functions that process media files stored in S3.

## Overview

This project demonstrates the use of **AWS S3 Object Lambda** to transform media files dynamically. It includes Lambda functions that:

- Generate thumbnails from videos and audio files
- Create composite thumbnails from banner sets (multiple ad sizes)
- Validate and process API-uploaded images
- Transform objects on-the-fly during GET requests (resize images, transcode videos)

## Architecture

The system uses two types of Lambda triggers:

1. **S3 Event Triggers**: Lambda functions that run automatically when objects are uploaded to S3
2. **S3 Object Lambda**: Intercepts GET requests and transforms objects in real-time based on query parameters

### Components

- **S3 Bucket**: Stores original media files and generated thumbnails
- **S3 Access Point**: Standard access point for the bucket
- **S3 Object Lambda Access Point**: Intercepts GET requests for on-the-fly transformations
- **Lambda Functions**: Process media files and handle transformations
- **Lambda Layers**: Provide FFmpeg and Sharp binaries for media processing

## Prerequisites

- Node.js 18.x or later
- AWS CLI configured with appropriate credentials
- Serverless Framework CLI (`npm install -g serverless`)
- Yarn package manager
- An existing CloudFormation stack named `general-resources-{stage}` that exports:
  - `IdentityPoolId`
  - `AccountStorageBucketName`
  - `AccountStorageBucketArn`
- Lambda layers stack named `layers-{stage}` that exports:
  - `Ffmpeg` layer ARN
  - `Sharp` layer ARN

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd serverless-resources
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   ```

## Deployment

Deploy to AWS using the Serverless Framework:

```bash
# Deploy to dev stage (default)
npx serverless deploy

# Deploy to a specific stage
npx serverless deploy --stage production

# Deploy a single function (faster for updates)
npx serverless deploy function -f createThumbnail
```

## Lambda Functions

### 1. createThumbnail

**Trigger**: S3 ObjectCreated event with suffix `-original`

**Purpose**: Generates thumbnails for uploaded videos and audio files

**Processing**:
- **Videos**: Extracts a frame at 1 second, resizes to 640px width
- **Audio**: Generates a waveform visualization as a PNG image

**Output**: Creates a new object with suffix `-thumbnail`

### 2. createBannersetThumbnail

**Trigger**: S3 ObjectCreated event with suffix `-bannerset`

**Purpose**: Creates composite thumbnails from banner sets containing multiple IAB standard ad sizes

**Processing**:
- Combines all banner sizes into a single preview image
- Uses default placeholders for missing banner sizes
- Supports: Half Page, Wide Skyscraper, Large Rectangle, Full Banner, Leaderboard, Half Banner

**Output**: Creates a 640px wide composite thumbnail

### 3. handleApiUpload

**Trigger**: S3 ObjectCreated event with suffix `-original-api`

**Purpose**: Validates and processes images uploaded via API

**Processing**:
- Validates image format using Sharp
- Extracts metadata (dimensions, format)
- Renames object and creates metadata tags
- Handles unsupported formats gracefully

**Output**: Creates objects with `-custom` and `-original` suffixes

### 4. getObjectTransformer

**Trigger**: S3 Object Lambda Access Point GET requests

**Purpose**: Transforms objects on-the-fly based on query parameters

**Supported Transformations**:
- `responseType=image`: Resize images (supports `width` and `height` parameters)
- `responseType=video`: Transcode videos (supports `width` and `height` parameters)
- `responseType=video-thumbnail`: Generate video thumbnails (supports `width` and `height` parameters)

**Usage Example**:
```javascript
// Transform options are passed via x-amz-transform-options query parameter
const transformOptions = JSON.stringify({
  responseType: 'image',
  width: 300,
  height: 200
});

// Access object through Object Lambda Access Point
const url = `https://<object-lambda-arn>.s3-object-lambda.us-east-1.amazonaws.com/path/to/object?x-amz-transform-options=${encodeURIComponent(transformOptions)}`;
```

## Configuration

### Environment Variables

Each Lambda function has access to:
- `BUCKET_NAME`: The S3 bucket name for storage
- `FFMPEG_PATH`: Path to FFmpeg binary in the Lambda layer (`/opt/ffmpeg/ffmpeg`)
- `region`: AWS region

### Custom Variables

Defined in `serverless.yml`:
- `identityPoolId`: Cognito Identity Pool ID
- `accountStorageBucketName`: S3 bucket name
- `accountStorageBucketArn`: S3 bucket ARN

These are imported from the `general-resources-{stage}` CloudFormation stack.

## Development

### Local Testing

Build the webpack bundle locally:
```bash
npx webpack --config webpack.config.js
```

### Validate Configuration

Check serverless.yml syntax:
```bash
npx serverless print
```

View compiled CloudFormation template:
```bash
npx serverless package
```

## File Naming Conventions

The system uses specific suffixes to trigger different Lambda functions:

- `-original`: Triggers thumbnail generation for videos/audio
- `-bannerset`: Triggers banner set composite thumbnail creation
- `-original-api`: Triggers API upload validation and processing
- `-thumbnail`: Generated thumbnail output
- `-custom`: Processed custom image output

## IAM Permissions

The Lambda functions have the following permissions:
- S3 Object Lambda: `WriteGetObjectResponse`
- S3 Bucket: `GetObject`, `PutObject`, `GetObjectTagging`, `PutObjectTagging`, `DeleteObject`, `ListBucket`

> **Note**: The current configuration includes broad `*:*` permissions for development. Consider restricting these in production environments.

## Troubleshooting

### Build Issues

If you encounter Sharp or FFmpeg issues:
1. Ensure Lambda layers are properly deployed
2. Check that `forceExclude` in `serverless.yml` includes `sharp` and `aws-sdk`
3. Verify the packager scripts are removing `node_modules/sharp`

### Runtime Issues

- Check CloudWatch Logs for detailed error messages
- Verify the Node.js runtime version matches between `serverless.yml` (nodejs18.x) and `webpack.config.js` (node: '18.0')
- Ensure sufficient memory (2048 MB) and timeout (30s) for media processing

### S3 Object Lambda Issues

- Verify the supporting Access Point exists and is accessible
- Check that the Lambda function has permission to call `WriteGetObjectResponse`
- Ensure transform options are properly JSON-encoded in the query parameter

## Technologies Used

- **AWS Lambda**: Serverless compute
- **AWS S3**: Object storage
- **AWS S3 Object Lambda**: On-the-fly object transformation
- **Serverless Framework**: Infrastructure as code
- **Webpack**: Module bundling
- **Sharp**: High-performance image processing
- **FFmpeg**: Video and audio processing
- **Babel**: JavaScript transpilation

## License

ISC

## Contributing

This is an example project demonstrating AWS S3 Object Lambda capabilities. Feel free to use it as a reference for your own implementations.

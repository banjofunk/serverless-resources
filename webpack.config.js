/**
 * Webpack configuration for Serverless Framework deployment.
 * 
 * This configuration bundles Lambda functions for AWS deployment, handling:
 * - External dependencies (node_modules are packaged separately by serverless-webpack)
 * - Babel transpilation for Node.js compatibility
 * - Source maps for debugging
 * - GraphQL file loading
 */

const slsw = require('serverless-webpack');
const nodeExternals = require('webpack-node-externals');
const path = require('path');

module.exports = {
  // Entry points are automatically determined by serverless-webpack
  entry: slsw.lib.entries,

  // Target Node.js environment (Lambda runtime)
  target: 'node',

  // Generate source maps for easier debugging in CloudWatch
  devtool: 'source-map',

  // Exclude node_modules from the bundle (they're packaged separately)
  // This significantly reduces bundle size and build time
  externals: [
    nodeExternals({
      modulesDir: path.resolve(__dirname, './node_modules'),
      additionalModuleDirs: [path.resolve(__dirname, '../../node_modules')],
    }),
  ],

  // Use development mode for local testing, production for deployment
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',

  // Disable minification to make CloudWatch logs more readable
  optimization: {
    minimize: false,
  },

  // Disable performance warnings (Lambda has its own size limits)
  performance: {
    hints: false,
  },

  module: {
    rules: [
      // Load GraphQL schema files
      {
        test: /\.(graphql|gql)$/,
        exclude: /node_modules/,
        loader: 'graphql-tag/loader',
      },
      // Transpile JavaScript to target Node.js 18.x
      {
        test: /\.js$/,
        loader: 'babel-loader',
        options: {
          babelrc: false,
          presets: [
            [
              '@babel/preset-env',
              {
                targets: {
                  node: '18.0', // Match the Lambda runtime version
                },
              },
            ],
          ],
        },
        // Exclude node_modules and build directories
        exclude: [/node_modules/, path.resolve(__dirname, '.serverless'), path.resolve(__dirname, '.webpack')],
      },
    ],
  },
};

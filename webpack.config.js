const slsw = require('serverless-webpack');
const nodeExternals = require('webpack-node-externals');
const path = require('path');

module.exports = {
  entry: slsw.lib.entries,
  target: 'node',
  devtool: 'source-map',
  externals: [
    nodeExternals({
      modulesDir: path.resolve(__dirname, './node_modules'),
      additionalModuleDirs: [path.resolve(__dirname, '../../node_modules')],
    }),
  ],
  mode: slsw.lib.webpack.isLocal ? 'development' : 'production',
  optimization: {
    minimize: false,
  },
  performance: {
    hints: false,
  },
  module: {
    rules: [
      {
        test: /\.(graphql|gql)$/,
        exclude: /node_modules/,
        loader: 'graphql-tag/loader',
      },
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
                  node: '8.10',
                },
              },
            ],
          ],
        },
        exclude: [/node_modules/, path.resolve(__dirname, '.serverless'), path.resolve(__dirname, '.webpack')],
      },
    ],
  },
};

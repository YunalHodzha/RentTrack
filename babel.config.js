module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    plugins: [
      // Inline drizzle-kit .sql migrations as strings at build time
      ['inline-import', { extensions: ['.sql'] }],
    ],
  };
};

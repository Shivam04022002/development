const { withAppBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidCoreOverride(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language === 'groovy') {
      const gradleBlock = `
// Added to fix androidx.core:core:1.17.0 breaking SDK 35/AGP 8.8.2
configurations.all {
    resolutionStrategy {
        force 'androidx.core:core:1.15.0'
        force 'androidx.core:core-ktx:1.15.0'
    }
}
`;
      if (!config.modResults.contents.includes("force 'androidx.core:core:1.15.0'")) {
        config.modResults.contents += gradleBlock;
      }
    }
    return config;
  });
};

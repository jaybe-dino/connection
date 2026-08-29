// 모노레포 공유 패키지(@connection/shared)를 소스로 직접 참조한다.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);
const shared = path.resolve(__dirname, "../../packages/shared/src");

config.watchFolders = [...(config.watchFolders ?? []), shared];
config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@connection/shared": shared,
};

module.exports = config;

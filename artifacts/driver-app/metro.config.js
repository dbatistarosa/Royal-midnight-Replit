const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);
const workspaceRoot = path.resolve(__dirname, "../..");
const appNodeModules = path.resolve(__dirname, "node_modules");
const virtualNodeModules = path.join(workspaceRoot, "node_modules/.pnpm/node_modules");
const resolveEntry = (name, originModulePath) => {
  const originDirectory = originModulePath ? path.dirname(originModulePath) : null;
  const roots = [originDirectory, appNodeModules, workspaceRoot, virtualNodeModules].filter(Boolean);
  return require.resolve(name, { paths: roots });
};
const directEntries = new Map(
  [
    "@expo/metro-runtime",
    "expo",
    "expo-asset",
    "expo-constants",
    "expo-file-system",
    "expo-font",
    "expo-keep-awake",
    "expo-linking",
    "expo-modules-core",
    "react",
    "react/jsx-runtime",
    "react/jsx-dev-runtime",
    "react-native",
    "react-native-reanimated",
    "react-native-safe-area-context",
    "react-native-screens",
    "react-native-worklets",
    "invariant",
    "whatwg-fetch",
  ].flatMap((name) => {
    try {
      return [[name, resolveEntry(name)]];
    } catch {
      return [];
    }
  }),
);

// Metro must resolve Expo Router's peer dependencies from the app and the
// workspace root when pnpm keeps packages in isolated virtual stores.
config.resolver = {
  ...config.resolver,
  disableHierarchicalLookup: true,
  nodeModulesPaths: [
    appNodeModules,
    path.resolve(workspaceRoot, "node_modules"),
  ],
  resolveRequest(context, moduleName, platform) {
    const directEntry = directEntries.get(moduleName);
    if (directEntry) {
      return { type: "sourceFile", filePath: directEntry };
    }
    try {
      return context.resolveRequest(context, moduleName, platform);
    } catch (error) {
      if (moduleName.startsWith(".") || moduleName.startsWith("/")) {
        throw error;
      }
      try {
        return {
          type: "sourceFile",
          filePath: resolveEntry(moduleName, context.originModulePath),
        };
      } catch {
        throw error;
      }
    }
  },
};

module.exports = withNativeWind(config, { input: "./global.css" });

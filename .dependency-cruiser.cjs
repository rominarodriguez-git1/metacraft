/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-adapter-imports-outside-registry",
      severity: "error",
      comment:
        "Only src/modules/providers/registry.ts may import concrete provider adapters under " +
        "src/modules/providers/adapters. Every other module under src/modules must depend on the " +
        "ProviderAdapter port instead.",
      from: {
        path: "^src/modules",
        pathNot: "^src/modules/providers/(adapters|registry\\.ts)",
      },
      to: {
        path: "^src/modules/providers/adapters",
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
  },
};

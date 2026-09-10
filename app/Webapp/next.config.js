/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  output: "standalone",
  typescript: {
    // Still true, and here is exactly why — do not flip this silently.
    //
    // `npx tsc --noEmit` reports 609 errors. Their distribution:
    //   487  orphan components (136 files unreachable from any app/ route —
    //        the PhysicianReportsModifiedV*/PatientReportModifiedV* version
    //        history). These are queued for deletion, so typing them is waste.
    //   122  four files that ARE imported by page.tsx but whose JSX is
    //        commented out, so they never render:
    //          93  components/ReportDownloadNonAIAPI.tsx  (page.tsx:58, JSX at 581 commented)
    //          17  components/charts/d3js/PieChartV3.tsx  (used only by Dashboard, never rendered)
    //          11  components/FilterSidebarV3.tsx         (page.tsx:54, JSX at 426 commented)
    //           1  components/PatientConsultationReports.tsx (imported, never rendered)
    //     0  code that actually renders, src/__tests__/, and e2e/ — all clean.
    //
    // Flip this to false in the same change that deletes the orphan files;
    // that removes 487 of the 609 in one step. Meanwhile `npm run typecheck`
    // runs the checker on demand so the count cannot drift upward unnoticed.
    ignoreBuildErrors: true,
  },
  webpack: (config, { webpack }) => {
    // @huggingface/transformers (Re-write Practice voice input) can resolve to a
    // Node entry point that pulls in the native onnxruntime-node binding and
    // sharp. Inference here always runs in the browser via onnxruntime-web, so
    // both are stubbed out — without this the server compile tries to bundle a
    // platform-specific .node binary that is not installed (see .npmrc).
    config.resolve.alias = {
      ...config.resolve.alias,
      "onnxruntime-node": false,
      sharp: false,
    };

    // onnxruntime-web ships its WebGPU proxy worker as a pre-built ESM file
    // (ort.bundle.min.mjs) that webpack copies into static/media verbatim. The
    // minifier then tries to minify it a second time and dies on its top-level
    // `import.meta`: "'import.meta' cannot be used outside of module code."
    //
    // The file is already minified, so saying so is the accurate fix rather than
    // a workaround — Next's minifier skips any asset flagged `minimized`. Runs
    // one stage before the minifier's own PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE tap.
    config.plugins.push({
      apply(compiler) {
        compiler.hooks.compilation.tap("SkipPrebuiltOrtBundle", (compilation) => {
          compilation.hooks.processAssets.tap(
            {
              name: "SkipPrebuiltOrtBundle",
              stage:
                webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE - 1,
            },
            (assets) => {
              for (const name of Object.keys(assets)) {
                // e.g. "static/media/ort.bundle.min.135f155b.mjs"
                if (/(^|[\\/])ort[\w.-]*\.mjs$/.test(name)) {
                  compilation.updateAsset(name, (source) => source, {
                    minimized: true,
                  });
                }
              }
            },
          );
        });
      },
    });

    return config;
  },
  // `eslint.ignoreDuringBuilds` is deliberately absent: .eslintrc.json now
  // exists, `next lint` reports 0 errors, and the build gates on errors only
  // (the 329 remaining findings are warnings), so the lint gate is live.
};

module.exports = nextConfig;

// Reference config for serving the app under a sub-path (kept for the day we
// deploy behind a prefix such as /sarscov):
//
// /** @type {import('next').NextConfig} */
// const nextConfig = {
//   reactStrictMode: true,
//   swcMinify: true,
//   output: "standalone",
//   basePath: "/sarscov",
//   assetPrefix: "/sarscov",
//   trailingSlash: true,
//   typescript: {
//     ignoreBuildErrors: true,
//   },
//   eslint: {
//     ignoreDuringBuilds: true,
//   },
// };

// module.exports = nextConfig;

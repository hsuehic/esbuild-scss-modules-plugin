"use strict";
// Modified from: https://github.com/indooorsman/esbuild-css-modules-plugin
// eff4a500c56a45b1550887a8f7c20f57b01a46b7
// MIT License
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScssModulesPlugin = void 0;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const crypto_1 = __importDefault(require("crypto"));
const postcss_1 = __importDefault(require("postcss"));
const postcssModules = __importStar(require("postcss-modules"));
const sass = __importStar(require("sass"));
const PLUGIN = "esbuild-scss-modules-plugin";
const PLUGIN_CSS = `${PLUGIN}-css`;
const DefaultOptions = {
    inject: true,
    minify: false,
    cache: true,
    localsConvention: "camelCaseOnly",
    generateScopedName: undefined,
    scssOptions: {},
    cssCallback: undefined,
};
async function buildScss(scssFullPath, sassOptions) {
    return await sass.compileAsync(scssFullPath, sassOptions);
}
async function buildScssModulesJS(scssFullPath, options) {
    const css = (await buildScss(scssFullPath, options.scssOptions)).css;
    let cssModulesJSON = {};
    const result = await (0, postcss_1.default)([
        postcssModules.default({
            localsConvention: options.localsConvention,
            generateScopedName: options.generateScopedName,
            getJSON(cssSourceFile, json) {
                cssModulesJSON = { ...json };
                return cssModulesJSON;
            },
        }),
        ...(options.minify
            ? [
                require("cssnano")({
                    preset: "default",
                }),
            ]
            : []),
    ]).process(css, {
        from: scssFullPath,
        map: false,
    });
    if (options.cssCallback)
        await options.cssCallback(result.css, cssModulesJSON);
    const classNames = JSON.stringify(cssModulesJSON);
    const hash = crypto_1.default.createHash("sha256");
    hash.update(result.css);
    const digest = hash.digest("hex");
    const js = `
    ${options.inject && `import "./${path_1.default.basename(scssFullPath)}?built";`}

const digest = '${digest}';
const classes = ${classNames};
const css = \`${result.css}\`;
${options.inject &&
        `
(function() {
  if (typeof document !== "undefined" && !document.getElementById(digest)) {
    var ele = document.createElement('style');
    ele.id = digest;
    ele.textContent = css;
    document.head.appendChild(ele);
  }
})();
`}
export default classes;
export { css, digest, classes };
  `;
    return { js, css: result.css };
}
const ScssModulesPlugin = (options = {}) => ({
    name: PLUGIN,
    setup(build) {
        const { outdir, bundle } = build.initialOptions;
        const results = new Map();
        const transformCssResult = new Map();
        const fullOptions = { ...DefaultOptions, ...options };
        build.onResolve({ filter: /\.modules?\.scss$/ }, async (args) => {
            debugger;
            const sourceFullPath = path_1.default.resolve(args.resolveDir, args.path);
            if (results.has(sourceFullPath))
                return results.get(sourceFullPath);
            const result = await (async () => {
                const sourceExt = path_1.default.extname(sourceFullPath);
                const sourceBaseName = path_1.default.basename(sourceFullPath, sourceExt);
                if (bundle) {
                    return {
                        path: sourceFullPath,
                        namespace: PLUGIN,
                        pluginData: {
                            sourceFullPath,
                        },
                    };
                }
                if (outdir) {
                    const isOutdirAbsolute = path_1.default.isAbsolute(outdir);
                    const absoluteOutdir = isOutdirAbsolute
                        ? outdir
                        : path_1.default.resolve(args.resolveDir, outdir);
                    const isEntryAbsolute = path_1.default.isAbsolute(args.path);
                    const entryRelDir = isEntryAbsolute
                        ? path_1.default.dirname(path_1.default.relative(args.resolveDir, args.path))
                        : path_1.default.dirname(args.path);
                    const targetSubpath = absoluteOutdir.indexOf(entryRelDir) === -1
                        ? path_1.default.join(entryRelDir, `${sourceBaseName}.css.js`)
                        : `${sourceBaseName}.css.js`;
                    const target = path_1.default.resolve(absoluteOutdir, targetSubpath);
                    const { js } = await buildScssModulesJS(sourceFullPath, fullOptions);
                    await promises_1.default.mkdir(path_1.default.dirname(target), {
                        recursive: true,
                    });
                    await promises_1.default.writeFile(target, js);
                }
                return { path: sourceFullPath, namespace: "file" };
            })();
            if (fullOptions.cache)
                results.set(sourceFullPath, result);
            return result;
        });
        build.onResolve({ filter: /\.modules?\.scss\?built$/, namespace: PLUGIN }, async (args) => {
            const sourceFullPath = path_1.default.resolve(args.resolveDir, args.path);
            return {
                path: args.path,
                namespace: PLUGIN,
                pluginData: {
                    sourceFullPath: args.importer,
                },
            };
        });
        build.onLoad({ filter: /\.modules?\.scss$/, namespace: PLUGIN }, async ({ pluginData: { sourceFullPath }, }) => {
            const { css, js } = await buildScssModulesJS(sourceFullPath, fullOptions);
            transformCssResult.set(sourceFullPath, css);
            return {
                contents: js,
                loader: "js",
                watchFiles: [sourceFullPath],
            };
        });
        build.onLoad({ filter: /\.modules?\.scss\?built$/, namespace: PLUGIN }, async ({ pluginData: { sourceFullPath }, }) => {
            if (fullOptions.inject)
                return undefined;
            const key = sourceFullPath;
            const css = transformCssResult.get(key);
            return {
                contents: css,
                loader: "css",
                watchFiles: [sourceFullPath],
            };
        });
    },
});
exports.ScssModulesPlugin = ScssModulesPlugin;
exports.default = exports.ScssModulesPlugin;

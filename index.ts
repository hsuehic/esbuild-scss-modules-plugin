// Modified from: https://github.com/indooorsman/esbuild-css-modules-plugin
// eff4a500c56a45b1550887a8f7c20f57b01a46b7
// MIT License

import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

import postcss from "postcss";
import * as postcssModules from "postcss-modules";
import * as sass from "sass";

import type * as esbuild from "esbuild";

const PLUGIN = "esbuild-scss-modules-plugin";
const PLUGIN_CSS = `${PLUGIN}-css`;

type CssModulesOptions = Parameters<postcssModules>[0];
export type PluginOptions = {
    inject: boolean;
    minify: boolean;
    cache: boolean;

    localsConvention: CssModulesOptions["localsConvention"];
    generateScopedName: CssModulesOptions["generateScopedName"];

    scssOptions: sass.Options<"async">;
    cssCallback?: (css: string, map: { [className: string]: string }) => void;
};
const DefaultOptions: PluginOptions = {
    inject: true,
    minify: false,
    cache: true,

    localsConvention: "camelCaseOnly",
    generateScopedName: undefined,

    scssOptions: {},
    cssCallback: undefined,
};

async function buildScss(
    scssFullPath: string,
    sassOptions: sass.Options<"async">
): Promise<sass.CompileResult> {
    return await sass.compileAsync(scssFullPath, sassOptions);
}

async function buildScssModulesJS(
    scssFullPath: string,
    options: PluginOptions
): Promise<{ js: string; css: string }> {
    const css = (await buildScss(scssFullPath, options.scssOptions)).css;

    let cssModulesJSON = {};
    const result = await postcss([
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

    const hash = crypto.createHash("sha256");
    hash.update(result.css);
    const digest = hash.digest("hex");

    const js = `
    ${options.inject && `import "./${path.basename(scssFullPath)}?built";`}

const digest = '${digest}';
const classes = ${classNames};
const css = \`${result.css}\`;
${
    options.inject &&
    `
(function() {
  if (typeof document !== "undefined" && !document.getElementById(digest)) {
    var ele = document.createElement('style');
    ele.id = digest;
    ele.textContent = css;
    document.head.appendChild(ele);
  }
})();
`
}
export default classes;
export { css, digest, classes };
  `;
    return { js, css: result.css };
}

export const ScssModulesPlugin = (options: Partial<PluginOptions> = {}) =>
    ({
        name: PLUGIN,
        setup(build: esbuild.PluginBuild) {
            const { outdir, bundle } = build.initialOptions;
            const results = new Map();
            const transformCssResult = new Map<string, string>();
            const fullOptions = { ...DefaultOptions, ...options };

            build.onResolve({ filter: /\.modules?\.scss$/ }, async (args) => {
                debugger;
                const sourceFullPath = path.resolve(args.resolveDir, args.path);

                if (results.has(sourceFullPath))
                    return results.get(sourceFullPath);

                const result = await (async () => {
                    const sourceExt = path.extname(sourceFullPath);
                    const sourceBaseName = path.basename(
                        sourceFullPath,
                        sourceExt
                    );

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
                        const isOutdirAbsolute = path.isAbsolute(outdir);
                        const absoluteOutdir = isOutdirAbsolute
                            ? outdir
                            : path.resolve(args.resolveDir, outdir);
                        const isEntryAbsolute = path.isAbsolute(args.path);
                        const entryRelDir = isEntryAbsolute
                            ? path.dirname(
                                  path.relative(args.resolveDir, args.path)
                              )
                            : path.dirname(args.path);

                        const targetSubpath =
                            absoluteOutdir.indexOf(entryRelDir) === -1
                                ? path.join(
                                      entryRelDir,
                                      `${sourceBaseName}.css.js`
                                  )
                                : `${sourceBaseName}.css.js`;
                        const target = path.resolve(
                            absoluteOutdir,
                            targetSubpath
                        );

                        const { js } = await buildScssModulesJS(
                            sourceFullPath,
                            fullOptions
                        );
                        await fs.mkdir(path.dirname(target), {
                            recursive: true,
                        });
                        await fs.writeFile(target, js);
                    }

                    return { path: sourceFullPath, namespace: "file" };
                })();

                if (fullOptions.cache) results.set(sourceFullPath, result);
                return result;
            });

            build.onResolve(
                { filter: /\.modules?\.scss\?built$/, namespace: PLUGIN },
                async (args) => {
                    const sourceFullPath = path.resolve(
                        args.resolveDir,
                        args.path
                    );
                    return {
                        path: args.path,
                        namespace: PLUGIN,
                        pluginData: {
                            sourceFullPath: args.importer,
                        },
                    };
                }
            );

            build.onLoad(
                { filter: /\.modules?\.scss$/, namespace: PLUGIN },
                async ({
                    pluginData: { sourceFullPath },
                }: {
                    pluginData: { sourceFullPath: string };
                }) => {
                    const { css, js } = await buildScssModulesJS(
                        sourceFullPath,
                        fullOptions
                    );
                    transformCssResult.set(sourceFullPath, css);
                    return {
                        contents: js,
                        loader: "js",
                        watchFiles: [sourceFullPath],
                    };
                }
            );

            build.onLoad(
                { filter: /\.modules?\.scss\?built$/, namespace: PLUGIN },
                async ({
                    pluginData: { sourceFullPath },
                }: {
                    pluginData: { sourceFullPath: string };
                }) => {
                    if (fullOptions.inject) return undefined;
                    const key = sourceFullPath;
                    const css = transformCssResult.get(key);
                    return {
                        contents: css,
                        loader: "css",
                        watchFiles: [sourceFullPath],
                    };
                }
            );
        },
    } as esbuild.Plugin);

export default ScssModulesPlugin;

//@ts-expect-error
declare module "*.modules.scss" {
    interface IClassNames {
        [className: string]: string;
    }
    const classes: IClassNames;
    const digest: string;
    const css: string;

    export default classes;
    export { classes, digest, css };
}

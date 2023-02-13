import * as postcssModules from "postcss-modules";
import * as sass from "sass";
import type * as esbuild from "esbuild";
type CssModulesOptions = Parameters<postcssModules>[0];
export type PluginOptions = {
    inject: boolean;
    minify: boolean;
    cache: boolean;
    localsConvention: CssModulesOptions["localsConvention"];
    generateScopedName: CssModulesOptions["generateScopedName"];
    scssOptions: sass.Options<"async">;
    cssCallback?: (css: string, map: {
        [className: string]: string;
    }) => void;
};
export declare const ScssModulesPlugin: (options?: Partial<PluginOptions>) => esbuild.Plugin;
export default ScssModulesPlugin;
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

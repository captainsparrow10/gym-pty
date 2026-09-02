import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const config = defineConfig({
	resolve: {
		tsconfigPaths: true,
		alias: {
			/*
			 * react-body-highlighter (last published 2023) declares `main` as CJS
			 * and has no `exports` map, so the default export arrives double-wrapped
			 * as `{ default: { default: Model } }` and React rejects it during SSR
			 * with "Element type is invalid ... got: object". Pointing at the ESM
			 * build, which has a plain `export default Model`, avoids the interop
			 * entirely. TypeScript still resolves types from the package root.
			 */
			"react-body-highlighter":
				"react-body-highlighter/dist/react-body-highlighter.esm.js",
		},
	},
	ssr: {
		// Bundle it rather than requiring it from node_modules while rendering.
		noExternal: ["react-body-highlighter"],
	},
	plugins: [
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;

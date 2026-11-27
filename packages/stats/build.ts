import * as fs from "node:fs/promises";

// Clean dist
await fs.rm("./dist/client", { recursive: true, force: true });

// Bundle the React app. CSS imported from TSX modules is emitted alongside as index.css.
console.log("Building dashboard client...");
const result = await Bun.build({
	entrypoints: ["./src/client/index.tsx"],
	outdir: "./dist/client",
	minify: true,
	naming: "[dir]/[name].[ext]",
});

if (!result.success) {
	console.error("Build failed");
	for (const message of result.logs) {
		console.error(message);
	}
	process.exit(1);
}

// The inline script applies the persisted theme before first paint (no flash).
const svgFavicon = encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b5b6ff"/><stop offset=".38" stop-color="#7c8bff"/><stop offset=".8" stop-color="#00dbe4"/><stop offset="1" stop-color="#ffd394"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="#0c1124"/><path fill="url(#g)" d="M11 52 17 12h9l14.1 26L44 12h9l-6 40h-9L23.9 26 20 52z"/><polygon fill="#ffd394" points="54,7 57,10 54,13 51,10"/></svg>',
);

const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Nightglide Stats</title>
    <script>
      (function () {
        try {
          var stored = localStorage.getItem("nightglide-stats-theme") || localStorage.getItem("omp-stats-theme");
          var system = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
          var theme = stored === "light" || stored === "dark" ? stored : system;
          document.documentElement.dataset.theme = theme;
          document.documentElement.style.colorScheme = theme;
        } catch (e) {}
      })();
    </script>
    <link rel="stylesheet" href="index.css">
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${svgFavicon}">
    <link rel="alternate icon" type="image/x-icon" href="favicon.ico">
</head>
<body>
    <div id="root"></div>
    <script src="index.js" type="module"></script>
</body>
</html>`;

// Static asset the bundler never emits; copied beside index.css so the on-disk client and the embedded archive both serve it.
await fs.copyFile("./src/client/favicon.ico", "./dist/client/favicon.ico");

await Bun.write("./dist/client/index.html", indexHtml);

console.log("Build complete");

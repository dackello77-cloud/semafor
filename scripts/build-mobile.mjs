import { cp, mkdir, rm } from "node:fs/promises";

await rm("www", { recursive: true, force: true });
await mkdir("www", { recursive: true });

await Promise.all([
  cp("index.html", "www/index.html"),
  cp("customer.html", "www/customer.html"),
  cp("manifest.webmanifest", "www/manifest.webmanifest"),
  cp("sw.js", "www/sw.js"),
  cp("assets", "www/assets", { recursive: true }),
  cp("css", "www/css", { recursive: true }),
  cp("js", "www/js", { recursive: true }),
]);

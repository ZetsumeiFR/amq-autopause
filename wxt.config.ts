import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    permissions: ["identity", "storage", "cookies", "tabs"],
    host_permissions: [
      "https://id.twitch.tv/*",
      "https://api.twitch.tv/*",
      "https://api.amqautopause.zetsumei.xyz/*", // Backend API
      "*://animemusicquiz.com/*", // AMQ site
    ],
  },
});

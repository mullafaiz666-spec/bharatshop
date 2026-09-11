module.exports = {
  version: "8.0",
  title: "BharatShop Local Workstation",
  description: "Optional one-click local developer workstation for BharatShop. Production remains on the hosted Netlify/Supabase/Gemini stack.",
  menu: async (kernel, info) => {
    const installed = info.exists("node_modules/next/package.json");
    const installing = info.running("install.js");
    const appRunning = info.running("start.js");
    const aiRunning = info.running("start-local-ai.js");

    if (installing) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Installing BharatShop dependencies",
        href: "install.js"
      }];
    }

    if (!installed) {
      return [{
        default: true,
        icon: "fa-solid fa-plug",
        text: "Install BharatShop dependencies",
        href: "install.js"
      }];
    }

    const items = [];

    if (appRunning) {
      const local = info.local("start.js");
      if (local && local.url) {
        items.push({
          default: true,
          icon: "fa-solid fa-store",
          text: "Open BharatShop",
          href: local.url
        });
      }
      items.push({
        icon: "fa-solid fa-terminal",
        text: "BharatShop terminal",
        href: "start.js"
      });
    } else {
      items.push({
        default: true,
        icon: "fa-solid fa-power-off",
        text: "Start BharatShop locally",
        href: "start.js"
      });
    }

    if (aiRunning) {
      const localAi = info.local("start-local-ai.js");
      if (localAi && localAi.url) {
        items.push({
          icon: "fa-solid fa-brain",
          text: "Open local Gemma models endpoint",
          href: localAi.url
        });
      }
      items.push({
        icon: "fa-solid fa-terminal",
        text: "Local AI terminal",
        href: "start-local-ai.js"
      });
    } else {
      items.push({
        icon: "fa-solid fa-brain",
        text: "Start optional local Gemma gateway",
        href: "start-local-ai.js"
      });
    }

    items.push({
      icon: "fa-solid fa-rotate",
      text: "Refresh dependencies",
      href: "install.js"
    });

    return items;
  }
};

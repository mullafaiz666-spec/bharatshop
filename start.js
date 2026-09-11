module.exports = {
  daemon: true,
  run: [
    {
      method: "local.set",
      params: {
        port: "{{port}}"
      }
    },
    {
      method: "shell.run",
      params: {
        env: {
          PORT: "{{local.port}}"
        },
        message: "npm run dev -- --hostname 127.0.0.1 --port {{local.port}}",
        on: [
          {
            event: "/Ready in/i",
            done: true
          }
        ]
      }
    },
    {
      method: "local.set",
      params: {
        url: "http://127.0.0.1:{{local.port}}"
      }
    }
  ]
};

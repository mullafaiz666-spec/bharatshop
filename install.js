module.exports = {
  run: [
    {
      method: "shell.run",
      params: {
        message: "npm ci --no-audit --no-fund"
      }
    }
  ]
};

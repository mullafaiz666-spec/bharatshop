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
        shell: "bash",
        env: {
          PORT: "{{local.port}}",
          USE_LOCAL_OLLAMA: "1",
          GEMMA_MODEL: "gemma3:270m-it-qat"
        },
        message: "if ! command -v ollama >/dev/null 2>&1; then echo 'PINOKIO_LOCAL_AI_PREREQ: Ollama is not installed in this Pinokio environment. Install Ollama and pull gemma3:270m-it-qat, then retry.'; exit 1; fi; sh local-ai/start.sh",
        on: [
          {
            event: "/Gemma gateway listening on/i",
            done: true
          }
        ]
      }
    },
    {
      method: "local.set",
      params: {
        url: "http://127.0.0.1:{{local.port}}/v1/models"
      }
    }
  ]
};

FROM ollama/ollama:latest

ENV OLLAMA_HOST=0.0.0.0:11434
ENV OLLAMA_KEEP_ALIVE=24h

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 11434
ENTRYPOINT ["/entrypoint.sh"]

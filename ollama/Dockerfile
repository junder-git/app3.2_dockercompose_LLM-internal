FROM ollama/ollama:latest

# Set environment variables
ENV OLLAMA_HOST=0.0.0.0:11434
ENV OLLAMA_ORIGINS=*

# Create scripts directory
RUN mkdir -p /scripts

# Copy initialization script
COPY scripts/init-ollama.sh /scripts/init-ollama.sh
RUN chmod +x /scripts/init-ollama.sh

# Create models directory
RUN mkdir -p /root/.ollama/models

# Expose port
EXPOSE 11434

# Start Ollama with initialization
CMD ["/scripts/init-ollama.sh"]
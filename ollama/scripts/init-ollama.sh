#!/bin/bash

echo "🚀 Starting Ollama service..."

# Start Ollama in background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "⏳ Waiting for Ollama to be ready..."
while ! curl -s http://localhost:11434/api/tags > /dev/null; do
    sleep 2
done

echo "✅ Ollama is ready!"

# Pull the model if specified and not already present
if [ -n "$MODEL_NAME" ]; then
    echo "📦 Checking for model: $MODEL_NAME"
    
    # Check if model exists
    if ! ollama list | grep -q "$MODEL_NAME"; then
        echo "⬇️  Pulling model: $MODEL_NAME"
        ollama pull "$MODEL_NAME"
        
        if [ $? -eq 0 ]; then
            echo "✅ Model $MODEL_NAME pulled successfully"
        else
            echo "❌ Failed to pull model $MODEL_NAME"
            echo "📝 Available models:"
            ollama list
        fi
    else
        echo "✅ Model $MODEL_NAME already exists"
    fi
    
    echo "📋 Current models:"
    ollama list
fi

echo "🎯 Ollama ready for internal chat!"

# Keep the service running
wait $OLLAMA_PID
#!/bin/bash

# Pixflow Desktop Launcher
# This script launches the Pixflow Electron app in development mode

cd "$(dirname "$0")"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Launch the app
echo "🚀 Starting Pixflow..."
npm run dev

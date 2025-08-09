#!/bin/bash

set -e

echo "Starting FlashSol bot"

if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js 18+"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Node.js 18+ required. Current: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

if [ ! -d "dist" ]; then
    echo "Building..."
    npm run build
fi

if [ ! -f ".env" ]; then
    echo "Creating .env config..."
    cp .env.example .env
    echo "Edit .env to customize settings"
fi

mkdir -p logs opportunities

echo ""
echo "FlashSol ready. Run with:"
echo "npm start"
echo ""
echo "Or with Docker:"
echo "docker-compose up -d"

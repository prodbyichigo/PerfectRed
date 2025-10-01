#!/bin/sh
if ! command -v node >/dev/null 2>&1; then
  echo "!Node.js is not installed! Please install it first:"
  echo "👉 https://nodejs.org/"
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ !npm is not installed. Please install Node.js (npm comes with it)!"
  exit 1
fi

echo "Node.js and npm are installed."
echo "Installing dependencies..."
npm install
if [ $? -eq 0 ]; then
  echo "Installation complete!"
else
  echo "npm install failed."
  exit 1
fi
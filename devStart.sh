#!/bin/sh
cd "$(dirname "$0")" || exit
npm run devStart
read -p "Press enter to close..."

#!/bin/sh
cd "$(dirname "$0")" || exit
npm start
read -p "Press enter to close..." #genuinely, no idea why this works but when i dont use it, it fails to start
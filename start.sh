#!/bin/sh
cd "$(dirname "$0")" || exit
npm start
read -p "Press enter to close..."

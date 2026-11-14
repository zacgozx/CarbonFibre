#!/bin/bash
# Double-click in Finder: pulls the latest CarbonFibre from Git, builds it and replaces the app in Applications.
exec bash "$(cd "$(dirname "$0")" && pwd)/scripts/update-mac.sh"

#!/bin/sh
set -e
# Deployments must never mutate the production schema implicitly.
exec npm run start

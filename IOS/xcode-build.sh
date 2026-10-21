#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEVELOPER_DIR=${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}
export DEVELOPER_DIR

xcodebuild \
  -project "$PROJECT_DIR/TowTeamMobile.xcodeproj" \
  -scheme TowTeamMobile \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$PROJECT_DIR/.derivedData" \
  CODE_SIGNING_ALLOWED=NO \
  build


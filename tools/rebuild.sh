#!/bin/bash
# Rebuilds data/projects.json from the source workbooks. Run from the dashboard folder.
D="$(cd "$(dirname "$0")/../.." && pwd)"; G="${GIS_DIR:-$HOME/garissa_local_workdir}"
python3 "$(dirname "$0")/build_data.py" "$D/GC Project _ FY 2018 - 22.xlsx" "$D/Stalled projects.xlsx" "$G/OUTPUT/garissa_wards.geojson" "$G/OUTPUT/garissa_subcounties.geojson" "$G/Garissa-County-Steering-Group-Portal/docs/data/health_facilities.geojson"

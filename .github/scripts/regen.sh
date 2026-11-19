#!/usr/bin/env bash
# Regenerate the English pages (full secinfo run if $1 is "true") and the
# translated pages from them. Fails without touching git if anything looks
# wrong, so a broken run can't commit half-empty tables.
set -euo pipefail

FULL="${1:-false}"
: "${LANGUAGES:?}" "${SECINFO_IMAGE:?}"

if [ "$FULL" = "true" ]; then
  echo "Full regen of English pages via secinfo ($SECINFO_IMAGE)"
  docker run --rm \
    -v "$PWD/templates:/app/templates" \
    -v "$PWD/index.md:/app/index.md" \
    -v "$PWD/inactive.md:/app/inactive.md" \
    -v "$PWD/streamers.csv:/app/streamers.csv" \
    -v "$PWD/inactive_streamers.csv:/app/inactive_streamers.csv" \
    "$SECINFO_IMAGE"
fi

# Table rows: everything after the separator row up to the first "### ".
sed -n '/^---: | --- | :--- | :---/,/^### /p' index.md | sed '1,1d;/^### /d' > active_table.txt
sed -n '/^--: | ---/,/^### /p' inactive.md | sed '1,1d;/^### /d' > inactive_table.txt

rows() { grep -c 'fa-twitch' "$1" || true; }
active_rows=$(rows active_table.txt)
inactive_rows=$(rows inactive_table.txt)
if [ "$active_rows" -eq 0 ] || [ "$inactive_rows" -eq 0 ]; then
  echo "Refusing to continue: extracted $active_rows active / $inactive_rows inactive rows" >&2
  exit 1
fi

for lang in $LANGUAGES; do
  mkdir -p "$lang"
  cat "templates/$lang/index.tmpl.md" > "$lang/index.md"
  sed -i '/^| --: | --- | :-- | :-- |$/r active_table.txt' "$lang/index.md"
  cat "templates/$lang/inactive.tmpl.md" > "$lang/inactive.md"
  sed -i '/^| --: | --- |$/r inactive_table.txt' "$lang/inactive.md"

  # A translated template whose table separator drifted would silently
  # produce an empty table; check every page got every row.
  if [ "$(rows "$lang/index.md")" -ne "$active_rows" ] || [ "$(rows "$lang/inactive.md")" -ne "$inactive_rows" ]; then
    echo "Refusing to continue: $lang pages have $(rows "$lang/index.md")/$(rows "$lang/inactive.md") rows, want $active_rows/$inactive_rows" >&2
    exit 1
  fi

  # Deploy translated FAQ/resources when Crowdin has them.
  for page in faq resources; do
    if [ -f "templates/$lang/$page.md" ]; then
      cp "templates/$lang/$page.md" "$lang/$page.md"
    fi
  done
done
rm -f active_table.txt inactive_table.txt
echo "Generated $active_rows active and $inactive_rows inactive rows for: $LANGUAGES"

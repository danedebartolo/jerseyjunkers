#!/bin/bash
cd images || { echo "run this from the repo folder"; exit 1; }
if [ -f _optimized ]; then echo "Already optimized — skipping"; exit 0; fi
echo "Before: $(du -sh . | cut -f1)"
for f in *.jpg *.jpeg; do
  [ -e "$f" ] || continue
  sips -s format jpeg -s formatOptions 72 "$f" --out "$f" >/dev/null 2>&1
done
: > _png_converted.txt
for f in *.png; do
  [ -e "$f" ] || continue
  alpha=$(sips -g hasAlpha "$f" 2>/dev/null | awk '/hasAlpha/{print $2}')
  if [ "$alpha" = "no" ]; then
    out="${f%.png}.jpg"
    if sips -s format jpeg -s formatOptions 78 "$f" --out "$out" >/dev/null 2>&1; then
      rm "$f"
      echo "$f" >> _png_converted.txt
    fi
  fi
done
if [ -d email ]; then
  for f in email/*.jpg email/*.jpeg; do
    [ -e "$f" ] || continue
    sips -s format jpeg -s formatOptions 72 "$f" --out "$f" >/dev/null 2>&1
  done
fi
touch _optimized
echo "After: $(du -sh . | cut -f1)"
echo "Converted $(wc -l < _png_converted.txt | tr -d ' ') PNGs to JPG"

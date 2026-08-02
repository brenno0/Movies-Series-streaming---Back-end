#!/bin/bash
# Run this AFTER docker compose up and after adding PT-BR indexers in Jackett UI.
# Reads Jackett API key from its config file, generates stremio-jackett URL, inserts into DB.

set -e

RD_KEY="RDNSKWQAKQQDGYRUV66FWRHTBAIZYX7JYAKMD4HD3RJ2A6AZWXGA"
DB="postgresql://docker:docker@localhost:5432/nbflix"

echo "⏳ Waiting for Jackett config..."
until docker exec nb-flix-jackett test -f /config/Jackett/ServerConfig.json 2>/dev/null; do
  sleep 2
done

JACKETT_API_KEY=$(docker exec nb-flix-jackett cat /config/Jackett/ServerConfig.json | python3 -c "import sys,json; print(json.load(sys.stdin)['APIKey'])")
echo "✅ Jackett API key: $JACKETT_API_KEY"

# Generate base64 config for stremio-addon-jackett
CONFIG=$(python3 -c "
import json, base64
config = {
  'jackettHost': 'http://nb-flix-jackett:9117',
  'jackettApiKey': '$JACKETT_API_KEY',
  'debridKey': '$RD_KEY',
  'service': 'realdebrid',
  'debrid': True,
  'jackett': True,
  'torrenting': False,
  'cache': True,
  'metadataProvider': 'cinemeta',
  'sort': 'quality',
  'languages': ['pt-BR', 'pt', 'en'],
  'maxResults': 5,
  'resultsPerQuality': 1,
  'maxSize': 0,
  'exclusion': ['cam', 'ts', 'telesync', 'telecine', 'screener']
}
print(base64.b64encode(json.dumps(config).encode()).decode())
")

ADDON_URL="http://nb-flix-jackett-stremio:3000/${CONFIG}"
echo "✅ Addon URL generated"

# Insert or update in AddonRegistry
docker exec movies-series-streaming---back-end-nb-flix-database-1 psql "$DB" -c "
INSERT INTO \"AddonRegistry\" (id, name, url, \"createdAt\", \"updatedAt\")
VALUES (gen_random_uuid(), 'Jackett PT-BR', '${ADDON_URL}', NOW(), NOW())
ON CONFLICT DO NOTHING;
"

# Flush Redis so new addon is used immediately
docker exec movies-series-streaming---back-end-nb-flix-cache-1 redis-cli FLUSHALL > /dev/null

echo ""
echo "✅ Done! Jackett PT-BR addon registered."
echo ""
echo "Next steps:"
echo "  1. Open http://localhost:9117 → Jackett UI"
echo "  2. Set FlareSolverr URL to: http://nb-flix-flaresolverr:8191"
echo "  3. Add indexers: search 'comando', 'bludv', 'megatorrent', 'baixarseries'"
echo "  4. Test indexers work"
echo "  5. Restart backend: docker compose restart nb-flix-backend"

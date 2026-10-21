cd /root/app
pkill -f "node src/index.js" 2>/dev/null || true
rm -f data/state.json
nohup env MAX_TEST_PER_CYCLE=300 TEST_CONCURRENCY=24 node scripts/refresh-once.js > data/r4.log 2>&1 &
echo started
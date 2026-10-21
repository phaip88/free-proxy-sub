set -e
mkdir -p /root/app/bin /root/app/data
tar xzf /root/fpsub.tgz -C /root/app
cd /root/app
curl -sL https://github.com/SagerNet/sing-box/releases/download/v1.14.3/sing-box-1.14.3-linux-amd64.tar.gz | tar xz -C /tmp
cp /tmp/sing-box-1.14.3-linux-amd64/sing-box bin/sing-box
chmod +x bin/sing-box
nohup env PORT=8080 MAX_TEST_PER_CYCLE=80 TEST_CONCURRENCY=20 node src/index.js > data/srv.log 2>&1 &
echo setup-done
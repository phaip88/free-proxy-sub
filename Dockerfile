FROM node:22-alpine

ARG SINGBOX_VERSION=1.14.3
RUN apk add --no-cache curl tar ca-certificates \
 && curl -fsSL "https://github.com/SagerNet/sing-box/releases/download/v${SINGBOX_VERSION}/sing-box-${SINGBOX_VERSION}-linux-amd64.tar.gz" \
    | tar xz -C /tmp \
 && mkdir -p /app/bin \
 && cp "/tmp/sing-box-${SINGBOX_VERSION}-linux-amd64/sing-box" /app/bin/sing-box \
 && chmod +x /app/bin/sing-box \
 && rm -rf /tmp/sing-box-*

WORKDIR /app
COPY package.json ./
COPY src ./src
ENV PORT=8080 DATA_DIR=/data
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "src/index.js"]

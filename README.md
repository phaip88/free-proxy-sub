# free-proxy-sub

订阅聚合 + 真连测速 + 订阅发布。一个 Node 进程，无数据库、无 TUN、无 root，可直接部署到 Railway。

原项目 free-proxy 依赖 OpenVPN + TUN 在 VPS 上做出口网关，容器环境跑不起来。本项目改为聚合公开订阅源里的 vmess / vless / trojan / ss / hysteria2 / tuic 节点，用 sing-box 真实建连测速，只把可用节点重新发布成标准订阅。客户端（v2rayN / v2rayNG / Shadowrocket / Clash / Mihomo）直接连节点，不需要前置代理。

## 工作方式

1. 拉取订阅源，解析分享链接，按协议+地址+凭据去重。
2. 每轮取 60% 已存活节点 + 40% 新节点，批量交给 sing-box，每批 40 个独立 SOCKS 入口，直连 `www.gstatic.com/generate_204` 校验，再对存活节点做带宽抽样。
3. 只保留最近一轮验证成功的节点，连续失败 3 次移出池。
4. 对外输出 base64 订阅 / Clash YAML，节点名带 `[速率 延迟]` 前缀，按速率排序。

## 部署

Railway：

```bash
railway login
railway init
railway up
railway domain
```

构建用仓库里的 `Dockerfile`，运行时会下载 sing-box。把 `DATA_DIR` 挂到持久卷（默认 `/data`），否则每次重启会重新测速。

也可以直接用任意 Docker 主机：

```bash
docker build -t free-proxy-sub .
docker run -d --name free-proxy-sub -p 8080:8080 -v $PWD/data:/data free-proxy-sub
```

## 客户端使用

| 客户端 | 订阅地址 |
| --- | --- |
| v2rayN / v2rayNG / Shadowrocket | `https://你的域名/sub` |
| Clash / Mihomo | `https://你的域名/clash` |
| 通用（带 target 参数） | `https://你的域名/sub?target=clash` |
| 明文查看 | `https://你的域名/sub/plain` |

订阅每 30 分钟自动更新，客户端按 `Profile-Update-Interval` 拉取。

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `DATA_DIR` | `./data` | 状态目录 |
| `SOURCES` | 内置 4 个公开源 | 逗号或换行分隔 |
| `REFRESH_MINUTES` | `30` | 刷新周期 |
| `MAX_TEST_PER_CYCLE` | `400` | 每轮测试节点数上限 |
| `TEST_CONCURRENCY` | `40` | 单批并发 |
| `TEST_TIMEOUT_MS` | `8000` | 单节点超时 |
| `SPEED_TEST` | `1` | 是否测带宽 |
| `SPEED_LIMIT` | `60` | 每批测速节点数上限 |
| `MAX_OUTPUT` | `300` | 订阅最多输出节点数 |
| `SUB_TOKEN` | 空 | 设置后所有接口需带 `?token=` 或 `X-Sub-Token` |

## 接口

- `GET /sub` base64 订阅，`GET /clash` Clash YAML
- `GET /api/stats` 运行状态与节点列表
- `POST /admin/refresh` 立即刷新（受 `SUB_TOKEN` 保护）
- `GET /healthz` 健康检查

## 实测

云端沙箱（8 vCPU / 4 GB，海外网络）：

- 4 个源共解析 6115 个唯一下发链接
- 一轮 200 节点测速 58 秒，存活 35（17.5%）
- 一轮 120 节点带带宽测试 88 秒，存活 41
- 发布订阅回环复测 35/35 通过，峰值 47 Mbps
- Clash YAML 解析通过：35 proxies / 1 group / `MATCH,PROXY`
- sing-box 峰值内存约 67 MB

# 照片足迹 / Photo Atlas

用虚构记录体验行政区地图、时间回放、行程年鉴和多年轨迹。公开版无需登录，也不接收照片。

Explore an administrative map, time playback, journey summaries and multi-year patterns with synthetic records. The public demo needs no account and accepts no photo uploads.

![Photo Atlas demo](./assets/screenshot.png)

- [Cloudflare Demo](https://photo-atlas.xiaosang.cc/)（待上线验证 / pending deployment）
- [GitHub Repo](https://github.com/holynova/photo-atlas)

<img src="./assets/qr.png" width="180" alt="QR code for the Cloudflare demo">

```sh
npm ci
npm run dev
npm run deploy:check
npm run deploy
```

底图由 [Natural Earth 5.1.2](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2) 公共领域数据简化生成。

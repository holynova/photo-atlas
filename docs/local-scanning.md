# 本地扫描

`npm run local` 打开 [本地工具](http://127.0.0.1:8766/scan)。终端保持运行即可查看生成的报告，按 Ctrl+C 停止。图形和命令行入口都接受 `--no-open` 和 `--port`。端口被占用时可加 `--port 0`，由系统选择空闲端口。

macOS 支持系统目录选择窗口。其他系统可以粘贴目录路径。扫描包含子目录，跳过隐藏项、符号链接和 Apple Photos 资源库包。Apple Photos 用户可先将照片导出到普通文件夹。HEIC 或 HEIF 在 macOS 可用系统解码生成预览。其他系统解码失败时，报告仍使用可读的元数据。

## 拍摄日期与城市

- 优先读取 EXIF 原始拍摄时间，必要时使用图片元数据中的创建时间。报告按元数据记录的本地日期归年，保留可用的时区偏移。「日期未知」单列。无 GPS 的照片仍计入拍摄日期统计。
- 中国境内用 GPS 匹配市级行政区边界。境外在已匹配的国家或地区内，用 15 公里内的城市参考点估算附近城市。市级数据不足时保留确知的省级或国别信息。历史索引可通过其中的 GPS 重新匹配城市。
- 到访段按记录日期归并。统计天数是有记录的自然日，同一天多座城市在总计里只计一次。照片记录可用于推测常住阶段。老家、工作地和旅行地等个人角色可手动标注。
- 标注、手动打卡和旅行清单存于当前浏览器。重新扫描同一目录后可继续使用。分享卡默认只带汇总，照片报告的分享卡可选加入封面。

每次扫描保存索引和去除元数据的缩略图。macOS 默认保存到 `~/Library/Application Support/Photo Atlas`，可用 `PHOTO_ATLAS_DATA_DIR` 自定义位置。索引包含照片相对路径及 GPS，服务仅监听本机回环地址。

## 开发与发布

- `npm run dev` 预览公开演示，`npm run deploy:check` 校验生产包。
- `npm run local -- --prototypes` 打开扫描入口设计原型。
- 公开演示部署在作品集 Worker 的 `/photo-atlas/` 子路径。设置 `PHOTO_ATLAS_PORTFOLIO_DIR` 后执行 `npm run publish:portfolio`，将公开资源复制到作品集仓库。

底图和国别边界取自公共领域数据 [Natural Earth 5.1.2](https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2)。中国市级边界取自 [chinese-global-compliant-geodata](https://github.com/JayMuShui/chinese-global-compliant-geodata/tree/3cf3485789876c37be6193bf2848cf9aaa40f758) 的 `chn-level-2.json`，数据包注明来源为天地图。项目保留其 [MIT 声明](../assets/china-cities.LICENSE)，将坐标压缩到四位小数并合并同编码要素。境外城市参考点取自 2026-11-15 下载的 [GeoNames](https://www.geonames.org/export/) 城市与国家数据，使用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可。

照片报告配图位于 [assets/annual](../assets/annual)，由 ImageGen 生成，分别描绘阳朔漓江、上海梧桐街区、杭州西湖与两次到访泉州的海边和港口。

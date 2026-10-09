# Google AdSense 接入说明

本项目是静态网页，无需打包或增加后端。主页已接入一个 Google AdSense 自适应展示广告，位于 `</main>` 和 `<footer>` 之间，并标注“广告”。发布商 ID 为 `ca-pub-8447316258615508`，广告位 ID 为 `6451167709`。正式展示取决于网站审核状态和实际广告投放结果。

## 当前项目的部署步骤

按本项目准备的 Nginx 配置：

1. 将更新后的 `index.html` 和 `styles.css` 上传到 `/data/mortgage-calc/`。
2. 将项目根目录的 `ads.txt` 上传到 `/var/www/html/ads.txt`。若服务器已有此文件，保留现有条目并加入本项目的条目。
3. 打开 `https://dclyh.com/mortgage-calc/`，确认页面和计算功能正常；检查 `https://dclyh.com/ads.txt` 返回本项目的发布商条目。
4. 在 AdSense 后台确认网站已验证并申请审核，查看网站和 ads.txt 的状态。`<head>` 中已有真实 AdSense 加载脚本，可使用后台的广告代码验证方式，不必重复添加脚本。

上述操作只更新静态文件，不需要重载 Nginx。若服务器实际的 `root` 或 `alias` 不同，按实际配置调整上传路径。

## 1. 准备域名和网站

- 将自己的域名解析到服务器，在 Nginx 中配置站点，建议启用 HTTPS。
- 确保域名首页有实际内容和通往计算器的链接。如果这个域名只用于计算器，可以直接将计算器作为首页。
- 注册 AdSense 时填写标准域名，例如 `example.com`。不要填写当前的 IP 地址或带 `/mortgage-calc/` 的地址；计算器本身仍可部署在这个目录。
- 保留计算规则和使用说明，并按平台要求提供隐私说明、完成账号资料设置。网站审核也会检查内容和用户体验，添加代码不代表审核通过。

参考：[申报网址要求](https://support.google.com/adsense/answer/2784438?hl=zh-Hans)、[申请条件](https://support.google.com/adsense/answer/9724?hl=en)。

## 2. 注册并验证网站

登录 [Google AdSense](https://adsense.google.com/start/)，按实际情况填写账号和收款资料。在“网站”中添加域名，按后台提示选择验证方法。

静态网页可以使用后台提供的元标记，将它放在 `index.html` 的 `<head>` 中。以下仅为格式示例，必须使用自己账号的真实代码：

```html
<meta name="google-adsense-account" content="ca-pub-0000000000000000">
```

如果域名首页是另一个 HTML 文件，验证标记也需要放在平台检查的首页上。上传修改后的文件，回到后台点击验证，再申请审核。此阶段可以只验证网站，不必先设置可见广告位。

参考：[添加网站、验证和申请审核](https://support.google.com/adsense/answer/12169212?hl=zh-Hans)。

## 3. 创建并安装广告单元

网站审核通过、状态为“就绪”后，在后台进入“广告 → 按广告单元 → 展示广告”，选择自适应尺寸，保存并获取代码。

本项目使用一个手动广告单元，放在 `</main>` 和 `<footer>` 之间，明确标注“广告”。页面未计算时也有该位置，尺寸由自适应广告代码决定。

后台生成的代码通常包含以下部分：

| 部分 | 本项目中的位置 |
| --- | --- |
| `adsbygoogle.js` 异步加载脚本 | `index.html` 的 `<head>`，同一页面只加载一次 |
| `<ins class="adsbygoogle">` 广告单元 | `<body>` 中选定的广告位置 |
| `adsbygoogle.push({})` 初始化代码 | 对应广告单元之后 |

使用后台生成的真实 `data-ad-client` 和 `data-ad-slot`；不要从其他网站复制这两个 ID。这个广告单元无需绑定计算按钮，也无需向广告平台发送贷款金额或计算结果。

参考：[创建展示广告单元](https://support.google.com/adsense/answer/9274025?hl=zh-Hans)、[广告单元说明](https://support.google.com/adsense/answer/9183549?hl=zh-Hans)。

## 4. 部署 ads.txt

项目根目录已有 `ads.txt`，根据本次提供的发布商 ID 生成以下条目，部署时核对它与后台提供的条目一致：

```text
google.com, pub-8447316258615508, DIRECT, f08c47fec0942fa0
```

将文件部署到域名根目录，使 `https://dclyh.com/ads.txt` 可以直接访问。即使计算器在 `/mortgage-calc/`，也应提供根目录的 `/ads.txt`。若该文件已存在，应保留现有条目并添加自己的条目。

注意：文件系统中的“项目目录”不一定是 Nginx 的“域名根目录”，需要根据实际 `root` 或 `alias` 配置确定上传位置。本地 `server.js` 已提供 `/ads.txt`，可访问 `http://127.0.0.1:4173/ads.txt` 检查；正式部署需在 Nginx 上核对域名根目录的访问地址。

参考：[官方 ads.txt 格式及根目录要求](https://support.google.com/adsense/answer/12169212?hl=zh-Hans)。

## 5. 上传与确认

- 将修改后的 `index.html` 和需要的样式文件上传到原来的网页目录，无需构建；`ads.txt` 按上一节单独部署。
- 打开正式域名，确认计算器仍能正常使用、广告区域布局正常，检查脚本加载和浏览器控制台。
- 在 AdSense 后台查看网站状态、ads.txt 状态、广告展示和收入。广告位暂时没有广告不代表代码一定有错，需要结合审核状态和加载情况判断。
- Nginx 访问日志用于观察网站流量；广告展示及收入以广告平台报表为准。

以后更换广告账号或单元时，同步更新 `index.html` 中加载脚本的 `client`、广告单元的 `data-ad-client` 和 `data-ad-slot`，以及 `ads.txt` 中的发布商 ID。这些是公开接入参数，无需提供账号密码。

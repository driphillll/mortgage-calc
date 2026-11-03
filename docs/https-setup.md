# dclyh.com 的 HTTPS 部署

目标地址为 `https://dclyh.com/mortgage-calc/`，域名首页继续跳转到计算器。正式切换后，80 端口的普通访问跳转到 HTTPS，证书验证路径继续保留在 80 端口。

DNS 的 A 记录负责把域名指向服务器；HTTPS 还需要可信的 TLS 证书、对应私钥及 Nginx 的 443 监听。可以使用免费的 [Let's Encrypt](https://letsencrypt.org/about/) 证书，通过 Certbot 申请和续期。Nginx 1.26.3 支持这里使用的配置；服务器的 Nginx 构建需要包含 HTTP SSL 模块。

## 配置文件

| 文件 | 何时使用 |
| --- | --- |
| [default.http.conf](../deploy/nginx/default.http.conf) | 证书尚未签发，提供 HTTP 网页和证书验证目录 |
| [default.https.conf](../deploy/nginx/default.https.conf) | 证书签发后，启用 HTTPS 和 HTTP 跳转 |
| [reload-nginx.sh](../deploy/nginx/reload-nginx.sh) | 主机直接安装 Nginx 时，作为 Certbot 成功续期后的重载钩子 |

配置统一维护在 [`deploy/nginx/`](../deploy/nginx/README.md)，目录说明同时列出了后续 CD 使用的公开资源清单和服务器路径。这两份配置供替换服务器实际启用的站点配置，不能把两个版本同时放进加载目录，否则会重复监听。

计算器仍对应 `/data/mortgage-calc/`，不增加 SPA 路由回退；不存在的静态文件返回 404。路径 `/mortgage-calc` 统一跳转到 `/mortgage-calc/`，使相对资源地址正常解析。根目录的其他静态文件仍由 `/var/www/html` 提供，例如后续的 `/ads.txt`。

## 部署前提

以下命令以 **Debian/Ubuntu、Nginx 直接安装在主机上** 为例；Nginx 站点文件按 `/etc/nginx/sites-available/default` 说明。先用 `sudo nginx -T` 确认实际加载路径。如果 Nginx 在 Docker 中，证书目录和验证目录需要卷映射，重载命令也需要针对容器调整。

服务器需要满足：

- `dclyh.com` 的 A 记录指向当前服务器。
- 云服务器安全组及主机防火墙允许入站 **TCP 80、443**。
- 如有域名 AAAA 记录，IPv6 地址也应能到达这个站点。
- Nginx 可以读取 `/data/mortgage-calc/` 的网页文件。

将 `deploy/nginx/` 下三个文件上传到服务器的非公开工作目录，例如 `~/mortgage-nginx/`，以下替换命令从该目录执行。证书和私钥由服务器上的 Certbot 生成，无需放入本项目或发送私钥。

## 1. 安装 Certbot 并备份配置

在 Debian/Ubuntu 主机上执行：

```bash
sudo apt update
sudo apt install certbot
cd ~/mortgage-nginx
sudo install -d /etc/nginx/backup
sudo cp -a /etc/nginx/sites-available/default "/etc/nginx/backup/default.$(date +%Y%m%d%H%M%S)"
sudo mkdir -p /etc/nginx/letsencrypt/.well-known/acme-challenge
```

使用其他系统时，按 [Certbot 官方安装指引](https://certbot.eff.org/instructions) 选择对应的安装方式。

## 2. 先启用 HTTP 配置

```bash
sudo install -m 644 default.http.conf /etc/nginx/sites-available/default
sudo nginx -t
sudo nginx -s reload
```

仅在 `nginx -t` 成功后执行重载。如有其他配置声明 `listen 80 default_server`，需要先消除重复。这一步还没有引用证书文件，因此能在首次申请证书前加载。

确认验证目录能从公网访问：

```bash
echo acme-ok | sudo tee /etc/nginx/letsencrypt/.well-known/acme-challenge/probe.txt
curl --fail http://dclyh.com/.well-known/acme-challenge/probe.txt
```

应返回 `acme-ok`。同时从自己的电脑访问该网址，确认公网可达。如果验证路径返回 404、被拦截或连接失败，应先修复路径或网络，再申请证书。

### 验证文件返回 404 时

Certbot 的 `-w` 参数必须与 Nginx 验证路径中的 `root` 一致。本方案统一使用 `/etc/nginx/letsencrypt`，因此上面的测试网址对应服务器文件 `/etc/nginx/letsencrypt/.well-known/acme-challenge/probe.txt`。这个目录只用于验证文件，正式证书仍由 Certbot 保存到 `/etc/letsencrypt/live/dclyh.com/`。

如果仍使用原始 `default`，需要在处理 `dclyh.com` 的 80 端口 `server` 中设置 `server_name dclyh.com;`，并加入以下配置；已有同名 `location` 时修改它，避免重复添加：

```nginx
location ^~ /.well-known/acme-challenge/ {
    root /etc/nginx/letsencrypt;
    default_type text/plain;
    try_files $uri =404;
}
```

保存后执行 `sudo nginx -t && sudo nginx -s reload`，再检查测试网址。若仍返回 404，用 `sudo nginx -T` 核对实际加载的站点文件、域名对应的 `server` 和验证目录，不要在测试文件可访问之前重复申请证书。启用 HTTPS 后也要保留这段 80 端口配置，供后续续期使用。

## 3. 申请域名证书

```bash
sudo certbot certonly --webroot \
  -w /etc/nginx/letsencrypt \
  --cert-name dclyh.com \
  -d dclyh.com
```

按交互提示填写真实邮箱并确认协议。此方法利用正在运行的 Nginx 提供验证文件，无需停止网站，也不会由 Certbot 自动重写站点配置。

本方案申请 `dclyh.com` 的证书，浏览器使用这个域名访问 HTTPS。签发成功后确认实际路径：

```bash
sudo certbot certificates
sudo test -f /etc/letsencrypt/live/dclyh.com/fullchain.pem
sudo test -f /etc/letsencrypt/live/dclyh.com/privkey.pem
```

`fullchain.pem` 包含站点证书及中间证书链，`privkey.pem` 是私钥。如果已有证书的实际路径不同，先调整 HTTPS 配置里的两个路径。

参考：[Certbot webroot 验证方式](https://eff-certbot.readthedocs.io/en/stable/using.html#webroot)、[Let's Encrypt HTTP-01 验证](https://letsencrypt.org/docs/challenge-types/)。

## 4. 证书存在后启用 443

```bash
sudo install -m 644 default.https.conf /etc/nginx/sites-available/default
sudo nginx -t
sudo nginx -s reload
```

同样只在语法检查成功后重载。HTTPS 版本的关键配置为：

```nginx
listen 443 ssl;
server_name dclyh.com;
ssl_certificate /etc/letsencrypt/live/dclyh.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/dclyh.com/privkey.pem;
ssl_protocols TLSv1.2 TLSv1.3;
```

不要在证书生成前启用这个版本，Nginx 的配置检查会因文件缺失而失败。

参考：[Nginx HTTPS 配置和证书链说明](https://nginx.org/en/docs/http/configuring_https_servers.html)。

## 5. 配置续期和重载

Webroot 方法签发证书后，Nginx 需要在成功续期时重载以读取新证书。将提供的脚本安装为 deploy hook：

```bash
sudo install -d /etc/letsencrypt/renewal-hooks/deploy
sudo install -m 755 reload-nginx.sh /etc/letsencrypt/renewal-hooks/deploy/reload-nginx
sudo systemctl enable --now certbot.timer
systemctl list-timers --all | grep certbot
sudo certbot renew --dry-run --run-deploy-hooks
```

上面的定时器命令适用于提供 `certbot.timer` 的发行版安装包。若安装方式改用 snap 或系统通过 cron 续期，应使用其实际提供的任务，不必重复创建定时器。

保留 80 端口和 `/.well-known/acme-challenge/` 的访问，后续自动续期还需要它。脚本先执行 `nginx -t`，再重载；如果 nginx 命令不在脚本的 PATH 中，应改成服务器实际二进制的绝对路径。

参考：[Certbot 续期及 deploy hooks](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates)。

## 6. 确认实际访问

```bash
curl -I https://dclyh.com/mortgage-calc/
curl -I https://dclyh.com/mortgage-calc/styles.css
curl -I https://dclyh.com/mortgage-calc/src/app.js
curl -I https://dclyh.com/mortgage-calc/src/calculator.js
curl -I https://dclyh.com/ads.txt
curl -I http://dclyh.com/mortgage-calc/
curl --fail http://dclyh.com/.well-known/acme-challenge/probe.txt
```

预期：HTTPS 页面和样式返回 200；HTTP 普通页面返回 301，Location 指向 HTTPS；验证文件仍返回 `acme-ok`。再用浏览器确认无证书错误、计算器和相对路径资源正常加载。

如果 HTTPS 连接超时，检查云安全组、主机防火墙和实际 443 监听；如果 Nginx 检查报证书错误，核对签发结果、路径及私钥读取权限。

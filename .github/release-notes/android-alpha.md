# Viraha Android Alpha

Requires Android 9 or newer. Download the `.apk` asset directly, allow the browser or file manager to install unknown apps, and open the downloaded file. No computer, Metro server, Expo account, or ZIP extraction is required.

Alpha builds use a test signing identity. A future production build may require uninstalling this Alpha first, which deletes local app data. Export anything important before upgrading.

The Alpha test signing key is not a production trust guarantee and must not be treated as proof of a production release.

Use the matching `.sha256` file to verify the APK's SHA-256 checksum. A match helps detect an incomplete or corrupted download; it does not replace Android's signature verification.

## 安装步骤

系统要求 Android 9 或更高版本。直接下载 `.apk` 即可安装；无需电脑、Metro 服务器、Expo 账号，也无需解压 ZIP。

1. 下载本发布页中的 `.apk` 文件，不要下载或解压源代码 ZIP。
2. 在浏览器或文件管理器的系统设置中允许安装未知应用。
3. 打开下载的 `.apk` 并完成安装，然后启动 Viraha。

## 校验与升级警告

可使用同名 `.sha256` 文件核对 APK 的 SHA-256 摘要，确认下载文件完整且未损坏。

Alpha 版本使用测试签名密钥；该密钥不提供生产环境的信任保证，也不能作为正式版本身份的证明。未来的正式版本可能要求先卸载 Alpha；卸载会删除本地应用数据，请在升级前导出重要内容。

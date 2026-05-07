#

静态网页 + Firebase：两人进入同一「房间」后实时同步流程；双方预期在云端以 **AES-GCM** 加密存储，仅在「揭晓」步骤在本机解密展示。

## 你需要准备的（Firebase）

1. 打开 [Firebase 控制台](https://console.firebase.google.com/)，新建项目（可不启用 Analytics）。
2. **构建 → Firestore Database**：创建数据库；可先使用「测试模式」完成开发，然后务必替换为下面的正式规则并发布。
3. **构建 → Authentication → 登录方法**：启用 **匿名**（Anonymous）登录。
4. **项目设置 → 您的应用**：添加 **Web** 应用，把配置复制到本仓库的 `firebase-config.js`（可参考 `firebase-config.example.js`）。
5. 将本仓库中的 **`firestore.rules`** 全文粘贴到 Firestore → **规则** → 发布。

### 规则在保护什么

- 只有文档里的 **`hostUid`（房主）** 与 **`guestUid`（第二位）** 可以读写该房间。
- 房间 ID 必须为 **32 位十六进制**，降低误猜测概率。
- **第二位成员未满员时**，任意已登录匿名用户若能猜到房间号可读该文档——因此安全性依赖 **房间号保密**；请勿把房间链接发到公开论坛。

### 共享口令做什么用

- **加入校验**：与对方约定同一口令后才能通过客户端校验（口令错误不会写入第二位 UID）。
- **加密**：与房间内的盐值一起做 PBKDF2，衍生密钥加密两人预期正文。

请勿把口令写在公开聊天里；建议当面或电话约定。

## 本地预览

需通过 **HTTP** 打开（ES Module 与 Firebase SDK 在 `file://` 下可能受限），例如在仓库目录执行：

```bash
npx --yes serve .
```

浏览器访问终端里提示的本地地址。

## 部署到 GitHub Pages

1. 将代码推送到 GitHub 仓库。
2. **Settings → Pages**：分支选 `main`，目录选 **`/ (root)`**。
3. `firebase-config.js` 中的 Web 配置会出现在前端，这是 Firebase 的预期用法；**真正权限由 Firestore 规则与 Authentication 控制**，务必按上文部署规则。

若不希望把含项目的 `firebase-config.js` 提交到公开仓库，可只在本地保留该文件，并在 `.gitignore` 中取消注释 `firebase-config.js` 一行；同时在 Pages 构建或私有分支中注入配置（略）。

## 文件说明

| 文件 | 说明 |
| --- | --- |
| `index.html` | 页面结构 |
| `styles.css` | 样式 |
| `app.js` | Firebase、加密与流程 |
| `firebase-config.js` | Firebase Web 配置（需自行填写） |
| `firebase-config.example.js` | 配置模板 |
| `firestore.rules` | 需在控制台发布 |

## 局限说明（知情同意）

- 当前规则 **不拆分字段级权限**：在极度不信任环境下，理论上同一房间内的成员若在揭晓前直接篡改 Firestore 中的字段，可能影响展示。本项目面向 **亲密关系场景**，默认双方善意使用。
- 若需要更强审计或字段级强制隔离，需要 **Cloud Functions** 或拆分数据结构并细化规则。

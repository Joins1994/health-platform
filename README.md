# 健康成长互动平台

中山市中小学生健康宣传 Web 应用，包含健康知识答题、幸运抽奖、作品征集投票、21天闯关打卡等功能模块。

## 功能特性

### 用户端
- **健康知识答题** — 按年级分类（小学低年级/高年级、初中、高中），随机抽取5题，全对可参与抽奖
- **幸运抽奖** — 答题全对后获得抽奖机会，中奖后填写领奖信息（姓名、学校、年级、班级、联系电话）
- **作品征集** — 围绕"健康生活"主题提交图文作品，支持上传最多6张图片
- **作品投票** — 每人每天可投3票，票数最高的作品获得奖励
- **21天闯关打卡** — 每天完成一个健康小任务，坚持21天养成健康好习惯
- **获奖名单** — 查看答题抽奖和作品征集的获奖记录

### 管理后台
- **仪表盘** — 查看用户数、答题次数、作品数量、打卡记录等统计数据
- **题库管理** — 增删题目，支持单选、多选、判断三种题型
- **作品审核** — 审核用户提交的作品（通过/拒绝）
- **奖品管理** — 设置奖品名称、数量、中奖概率
- **用户管理** — 查看用户信息和答题记录
- **打卡记录** — 查看所有用户的打卡详情

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Node.js + Express |
| 数据库 | SQLite3 |
| 认证 | JWT + bcrypt |
| 文件上传 | Multer |
| 前端 | 原生 HTML/CSS/JavaScript |

## 快速开始

### 环境要求
- Node.js >= 16
- npm >= 7

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/Joins1994/health-platform.git
cd health-platform

# 安装依赖
npm install

# 启动服务
npm start
```

启动后访问：
- 用户端：http://localhost:3000
- 管理后台：http://localhost:3000/admin

### 默认管理员账号
- 用户名：`admin`
- 密码：`admin123`

## 项目结构

```
health-platform/
├── server/
│   ├── index.js              # Express 服务入口，所有 API 路由
│   ├── database.js           # SQLite 数据库初始化和示例数据
│   └── static/
│       ├── user/             # 用户端页面
│       │   ├── index.html        # 首页
│       │   ├── quiz.html         # 答题 + 抽奖 + 领奖登记
│       │   ├── works.html        # 作品列表 + 投票
│       │   ├── works-submit.html # 提交作品
│       │   ├── checkin.html      # 21天打卡
│       │   ├── winners.html      # 获奖名单
│       │   ├── css/style.css     # 用户端样式
│       │   └── js/app.js         # 公共工具（API、认证、Toast）
│       └── admin/            # 管理后台页面
│           ├── login.html        # 管理员登录
│           ├── dashboard.html    # 仪表盘
│           ├── questions.html    # 题库管理
│           ├── works-review.html # 作品审核
│           ├── prizes.html       # 奖品管理
│           ├── users.html        # 用户管理
│           ├── records.html      # 答题记录
│           ├── checkin-records.html # 打卡记录
│           ├── css/admin.css     # 后台样式
│           └── js/admin.js       # 后台公共工具
├── data/                       # SQLite 数据库文件（自动生成）
├── uploads/                    # 用户上传图片（自动生成）
├── package.json
└── .gitignore
```

## API 接口

### 用户端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/login` | 用户登录（模拟微信） |
| GET | `/api/quiz/questions/:category` | 获取题目 |
| POST | `/api/quiz/submit` | 提交答案 |
| POST | `/api/quiz/lottery` | 抽奖 |
| POST | `/api/quiz/register` | 领奖信息登记 |
| GET | `/api/quiz/winners` | 获奖名单 |
| GET | `/api/works` | 作品列表 |
| POST | `/api/works` | 提交作品 |
| POST | `/api/works/:id/vote` | 投票 |
| GET | `/api/works/winners` | 作品获奖名单 |
| GET | `/api/checkin/tasks` | 打卡任务列表 |
| POST | `/api/checkin` | 提交打卡 |
| GET | `/api/checkin/progress` | 打卡进度 |
| GET | `/api/stats` | 统计数据 |

### 管理后台 API（需认证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/admin/api/login` | 管理员登录 |
| GET | `/admin/api/questions` | 题目列表 |
| POST | `/admin/api/questions` | 添加题目 |
| DELETE | `/admin/api/questions/:id` | 删除题目 |
| GET | `/admin/api/works` | 作品列表（按状态筛选） |
| PUT | `/admin/api/works/:id` | 审核作品 |
| GET | `/admin/api/prizes` | 奖品列表 |
| POST | `/admin/api/prizes` | 添加奖品 |
| PUT | `/admin/api/prizes/:id` | 编辑奖品 |
| DELETE | `/admin/api/prizes/:id` | 删除奖品 |
| GET | `/admin/api/users` | 用户列表 |
| GET | `/admin/api/quiz-records` | 答题记录 |
| GET | `/admin/api/checkin-records` | 打卡记录 |

## 部署到云主机

```bash
# 1. 安装 Node.js（如未安装）
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. 克隆项目
git clone https://github.com/Joins1994/health-platform.git
cd health-platform

# 3. 安装依赖
npm install

# 4. 启动（后台运行）
nohup npm start > health-platform.log 2>&1 &

# 5. 使用 PM2 保持进程（推荐）
npm install -g pm2
pm2 start server/index.js --name health-platform
pm2 save
pm2 startup
```

## License

MIT

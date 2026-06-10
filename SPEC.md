# 中山市保健所健康宣传互动平台 - 项目规范

## 1. 项目概述

**项目名称**: 健康成长互动平台  
**目标用户**: 中山市中小学生  
**运行环境**: 微信公众号内嵌浏览器 + PC浏览器  
**核心目标**: 通过趣味互动方式开展健康知识宣传

---

## 2. 功能模块

### 2.1 答题抽奖模块

**功能流程**:
1. 用户进入答题页面，选择年级（小学/初中/高中）
2. 系统从题库随机抽取5道题
3. 答对3题以上可参与抽奖
4. 抽奖后需登记身份信息（姓名+学校+班级）
5. 获奖名单展示

**题库分类**:
- 小学组（1-3年级、4-6年级）
- 初中组（7-9年级）
- 高中组（10-12年级）

**题目类型**: 单选题、多选题、判断题

**抽奖机制**: 随机抽取奖品，奖品池管理员后台配置

---

### 2.2 作品征集模块

**功能流程**:
1. 活动介绍页面展示
2. 作品提交（图片/视频 + 简介）
3. 作品展示列表（分页浏览）
4. 在线投票（每人每天可投3票）
5. 获奖名单公布

**作品要求**:
- 图片：JPG/PNG，单张≤5MB，最多6张
- 视频：MP4，时长≤3分钟，≤100MB
- 简介：100-500字

---

### 2.3 21天健康闯关打卡模块

**设计理念**: 培养健康习惯，21天持续打卡

**闯关结构**:
- 21天分7个闯关主题（每3天一个主题）
- 每个主题包含3个健康任务
- 每天完成当日任务打卡

**闯关主题**:
| 周次 | 主题 | 任务示例 |
|------|------|----------|
| 第1周 | 睡眠充足 | 早睡早起、规律作息、睡前不用电子设备 |
| 第2周 | 均衡饮食 | 早餐必吃、少吃零食、多吃蔬果 |
| 第3周 | 积极运动 | 每日运动30分钟、户外活动、运动打卡 |

**激励机制**:
- 连续打卡显示连续天数
- 完成每关获得虚拟徽章
- 完成全部21天获得"健康达人"称号

---

## 3. 技术架构

### 3.1 前端技术
- HTML5 + CSS3 + JavaScript
- 响应式设计（适配手机端微信/PC端）
- 页面框架：单页应用（SPA）架构

### 3.2 后端技术
- Node.js + Express
- SQLite数据库（轻量级，易部署）
- JWT身份验证

### 3.3 目录结构
```
health-platform/
├── server/                 # 后端服务
│   ├── index.js           # 服务器入口
│   ├── database.js        # 数据库操作
│   ├── routes/            # 路由
│   │   ├── quiz.js        # 答题相关
│   │   ├── work.js        # 作品相关
│   │   ├── checkin.js     # 打卡相关
│   │   └── admin.js       # 管理后台
│   └── static/            # 静态文件
│       ├── user/          # 用户端页面
│       └── admin/         # 管理后台页面
└── data/                   # SQLite数据文件
```

---

## 4. 数据库设计

### 4.1 数据表

**questions** - 题库表
```sql
CREATE TABLE questions (
  id INTEGER PRIMARY KEY,
  category VARCHAR(20),     -- 'primary_low','primary_high','middle','high'
  type VARCHAR(10),         -- 'single','multiple','judge'
  question TEXT,
  options TEXT,             -- JSON格式存储选项
  answer TEXT,              -- 正确答案
  explanation TEXT          -- 解析
);
```

**quiz_records** - 答题记录表
```sql
CREATE TABLE quiz_records (
  id INTEGER PRIMARY KEY,
  openid VARCHAR(100),
  category VARCHAR(20),
  score INTEGER,
  prize TEXT,
  prize_status VARCHAR(20), -- 'pending','claimed'
  created_at DATETIME
);
```

**users** - 用户信息表
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  openid VARCHAR(100) UNIQUE,
  name VARCHAR(50),
  school VARCHAR(100),
  grade VARCHAR(20),
  class VARCHAR(20),
  created_at DATETIME
);
```

**works** - 作品表
```sql
CREATE TABLE works (
  id INTEGER PRIMARY KEY,
  openid VARCHAR(100),
  title VARCHAR(100),
  description TEXT,
  images TEXT,              -- JSON数组
  video VARCHAR(500),
  votes INTEGER DEFAULT 0,
  status VARCHAR(20),       -- 'pending','approved','rejected'
  created_at DATETIME
);
```

**vote_records** - 投票记录表
```sql
CREATE TABLE vote_records (
  id INTEGER PRIMARY KEY,
  openid VARCHAR(100),
  work_id INTEGER,
  date DATE,
  created_at DATETIME
);
```

**checkin_records** - 打卡记录表
```sql
CREATE TABLE checkin_records (
  id INTEGER PRIMARY KEY,
  openid VARCHAR(100),
  day_number INTEGER,       -- 1-21
  task_id INTEGER,
  proof TEXT,               -- 图片或文字记录
  created_at DATETIME
);
```

**prizes** - 奖品配置表
```sql
CREATE TABLE prizes (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100),
  description TEXT,
  quantity INTEGER,
  remaining INTEGER,
  probability REAL           -- 权重概率
);
```

---

## 5. API接口设计

### 5.1 答题模块
- `GET /api/quiz/questions/:category` - 获取题目
- `POST /api/quiz/submit` - 提交答案
- `POST /api/quiz/lottery` - 抽奖
- `POST /api/quiz/register` - 身份登记

### 5.2 作品模块
- `GET /api/works` - 获取作品列表
- `POST /api/works` - 提交作品
- `POST /api/works/:id/vote` - 投票
- `GET /api/works/winners` - 获奖名单

### 5.3 打卡模块
- `GET /api/checkin/tasks` - 获取任务列表
- `POST /api/checkin` - 打卡
- `GET /api/checkin/progress` - 获取进度

### 5.4 管理后台
- `POST /admin/login` - 管理员登录
- `GET /admin/questions` - 题库管理
- `POST /admin/questions` - 添加题目
- `GET /admin/works` - 作品审核
- `PUT /admin/works/:id` - 审核作品
- `GET /admin/prizes` - 奖品管理
- `POST /admin/prizes` - 添加奖品

---

## 6. 页面设计

### 6.1 用户端页面
- `index.html` - 首页导航
- `quiz.html` - 答题页面
- `quiz-result.html` - 答题结果/抽奖
- `register.html` - 身份登记
- `works.html` - 作品展示
- `works-submit.html` - 作品提交
- `checkin.html` - 21天闯关
- `checkin-task.html` - 每日任务
- `winners.html` - 获奖名单

### 6.2 管理后台页面
- `login.html` - 登录页
- `dashboard.html` - 管理仪表盘
- `questions.html` - 题库管理
- `works-review.html` - 作品审核
- `prizes.html` - 奖品管理
- `stats.html` - 数据统计

---

## 7. 视觉设计

### 7.1 配色方案
- 主色调: `#2E7D32` (健康绿)
- 辅助色: `#81C784` (浅绿)
- 强调色: `#FF9800` (活力橙)
- 背景色: `#F5F5F5` (浅灰)
- 文字色: `#212121` (深灰)

### 7.2 设计风格
- 清新活泼，适合青少年
- 圆润卡片设计
- 图标使用Font Awesome
- 动画过渡流畅

---

## 8. 部署说明

### 8.1 环境要求
- Node.js 16+
- npm 8+

### 8.2 启动方式
```bash
cd server
npm install
npm start
```

### 8.3 访问地址
- 用户端: `http://localhost:3000/`
- 管理后台: `http://localhost:3000/admin/`
- 默认管理员账号: admin / admin123

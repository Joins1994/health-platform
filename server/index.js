const express = require('express');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { dbAsync, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'health-platform-secret-key-2024';

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件
app.use('/static', express.static(path.join(__dirname, 'static')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 确保上传目录存在
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// 文件上传配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB
});

// ===== 认证中间件 =====
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: '认证失败' });
  }
}

// ===== 模拟微信登录（实际部署时接入微信OAuth） =====
app.post('/api/login', async (req, res) => {
  const { code } = req.body;
  const openid = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    let user = await dbAsync.get('SELECT * FROM users WHERE openid = ?', [openid]);
    if (!user) {
      await dbAsync.run('INSERT INTO users (openid) VALUES (?)', [openid]);
      user = await dbAsync.get('SELECT * FROM users WHERE openid = ?', [openid]);
    }
    res.json({ openid, user });
  } catch (err) {
    res.status(500).json({ error: '登录失败' });
  }
});

// ===== 答题模块 =====

// 获取题目
app.get('/api/quiz/questions/:category', async (req, res) => {
  const { category } = req.params;
  const count = parseInt(req.query.count) || 5;
  
  try {
    const questions = await dbAsync.all('SELECT * FROM questions WHERE category = ? ORDER BY RANDOM() LIMIT ?', [category, count]);
    
    const formatted = questions.map(q => ({
      id: q.id,
      type: q.type,
      question: q.question,
      options: JSON.parse(q.options)
    }));
    
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: '获取题目失败' });
  }
});

// 提交答案
app.post('/api/quiz/submit', async (req, res) => {
  const { openid, category, answers } = req.body;
  
  let correct = 0;
  const results = [];
  
  try {
    for (const ans of answers) {
      const question = await dbAsync.get('SELECT * FROM questions WHERE id = ?', [ans.questionId]);
      if (question) {
        const isCorrect = question.answer === ans.answer;
        if (isCorrect) correct++;
        results.push({
          questionId: ans.questionId,
          correct: isCorrect,
          correctAnswer: question.answer,
          explanation: question.explanation
        });
      }
    }
    
    const total = answers.length;
    const score = correct;
    const passed = score === total;
    
    await dbAsync.run('INSERT INTO quiz_records (openid, category, score, total) VALUES (?, ?, ?, ?)', [openid, category, score, total]);
    
    res.json({ score, total, passed, results });
  } catch (err) {
    res.status(500).json({ error: '提交失败' });
  }
});

// 抽奖
app.post('/api/quiz/lottery', async (req, res) => {
  const { openid } = req.body;
  
  try {
    const prizes = await dbAsync.all('SELECT * FROM prizes WHERE remaining > 0');
    
    if (prizes.length === 0) {
      return res.json({ prize: null, message: '奖品已抽完' });
    }
    
    const totalWeight = prizes.reduce((sum, p) => sum + p.probability, 0);
    let random = Math.random() * totalWeight;
    
    let selectedPrize = null;
    for (const prize of prizes) {
      random -= prize.probability;
      if (random <= 0) {
        selectedPrize = prize;
        break;
      }
    }
    
    if (selectedPrize) {
      await dbAsync.run('UPDATE prizes SET remaining = remaining - 1 WHERE id = ?', [selectedPrize.id]);
      // SQLite不支持UPDATE ORDER BY LIMIT，用子查询实现
      await dbAsync.run(
        'UPDATE quiz_records SET prize = ? WHERE rowid = (SELECT rowid FROM quiz_records WHERE openid = ? AND prize IS NULL ORDER BY id DESC LIMIT 1)',
        [selectedPrize.name, openid]
      );
    }
    
    res.json({ 
      prize: selectedPrize ? { name: selectedPrize.name, description: selectedPrize.description } : null 
    });
  } catch (err) {
    console.error('抽奖错误:', err);
    res.status(500).json({ error: '抽奖失败: ' + err.message });
  }
});

// 身份登记
app.post('/api/quiz/register', async (req, res) => {
  const { openid, name, school, grade, class: className, phone } = req.body;
  
  try {
    await dbAsync.run('UPDATE users SET name = ?, school = ?, grade = ?, class = ?, phone = ? WHERE openid = ?', [name, school, grade, className, phone || null, openid]);
    await dbAsync.run('UPDATE quiz_records SET user_info = ? WHERE openid = ? AND user_info IS NULL', [JSON.stringify({ name, school, grade, class: className, phone: phone || '' }), openid]);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '登记失败' });
  }
});

// 获奖名单
app.get('/api/quiz/winners', async (req, res) => {
  try {
    const winners = await dbAsync.all(`
      SELECT qr.*, u.name, u.school, u.grade, u.class 
      FROM quiz_records qr 
      LEFT JOIN users u ON qr.openid = u.openid 
      WHERE qr.prize IS NOT NULL AND qr.prize != ''
      ORDER BY qr.created_at DESC
      LIMIT 50
    `);
    
    res.json(winners);
  } catch (err) {
    res.status(500).json({ error: '获取获奖名单失败' });
  }
});

// ===== 作品征集模块 =====

// 获取作品列表
app.get('/api/works', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;
  
  try {
    const works = await dbAsync.all(`
      SELECT w.*, u.name as author_name, u.school 
      FROM works w 
      LEFT JOIN users u ON w.openid = u.openid 
      WHERE w.status = 'approved'
      ORDER BY w.votes DESC, w.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const total = await dbAsync.get('SELECT COUNT(*) as count FROM works WHERE status = ?', ['approved']);
    
    const formatted = works.map(w => ({
      ...w,
      images: w.images ? JSON.parse(w.images) : []
    }));
    
    res.json({ works: formatted, total: total.count, page, limit });
  } catch (err) {
    res.status(500).json({ error: '获取作品失败' });
  }
});

// 提交作品
app.post('/api/works', upload.array('images', 6), async (req, res) => {
  const { openid, title, description } = req.body;
  const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
  
  try {
    const result = await dbAsync.run('INSERT INTO works (openid, title, description, images) VALUES (?, ?, ?, ?)', [openid, title, description, JSON.stringify(images)]);
    res.json({ id: result.lastID, success: true });
  } catch (err) {
    res.status(500).json({ error: '提交作品失败' });
  }
});

// 投票
app.post('/api/works/:id/vote', async (req, res) => {
  const { id } = req.params;
  const { openid } = req.body;
  const today = new Date().toISOString().split('T')[0];
  
  try {
    const voteCount = await dbAsync.get('SELECT COUNT(*) as count FROM vote_records WHERE openid = ? AND vote_date = ?', [openid, today]);
    
    if (voteCount.count >= 3) {
      return res.status(400).json({ error: '今日投票次数已用完' });
    }
    
    const alreadyVoted = await dbAsync.get('SELECT id FROM vote_records WHERE openid = ? AND work_id = ? AND vote_date = ?', [openid, id, today]);
    if (alreadyVoted) {
      return res.status(400).json({ error: '今天已经投过这个作品了' });
    }
    
    await dbAsync.run('INSERT INTO vote_records (openid, work_id, vote_date) VALUES (?, ?, ?)', [openid, id, today]);
    await dbAsync.run('UPDATE works SET votes = votes + 1 WHERE id = ?', [id]);
    
    res.json({ success: true, remaining: 3 - voteCount.count - 1 });
  } catch (err) {
    res.status(500).json({ error: '投票失败' });
  }
});

// 作品获奖名单
app.get('/api/works/winners', async (req, res) => {
  try {
    const winners = await dbAsync.all(`
      SELECT w.*, u.name as author_name, u.school 
      FROM works w 
      LEFT JOIN users u ON w.openid = u.openid 
      WHERE w.status = 'approved'
      ORDER BY w.votes DESC
      LIMIT 10
    `);
    
    res.json(winners.map(w => ({ ...w, images: w.images ? JSON.parse(w.images) : [] })));
  } catch (err) {
    res.status(500).json({ error: '获取获奖名单失败' });
  }
});

// ===== 21天闯关打卡模块 =====

// 获取任务列表
app.get('/api/checkin/tasks', async (req, res) => {
  try {
    const tasks = await dbAsync.all('SELECT * FROM checkin_tasks ORDER BY day_number, task_order');
    
    const grouped = {};
    tasks.forEach(t => {
      if (!grouped[t.day_number]) {
        grouped[t.day_number] = [];
      }
      grouped[t.day_number].push(t);
    });
    
    res.json(grouped);
  } catch (err) {
    res.status(500).json({ error: '获取任务失败' });
  }
});

// 打卡
app.post('/api/checkin', upload.single('proof'), async (req, res) => {
  const { openid, dayNumber, taskId } = req.body;
  const proof = req.file ? `/uploads/${req.file.filename}` : req.body.proof || '';
  
  try {
    const existing = await dbAsync.get('SELECT id FROM checkin_records WHERE openid = ? AND day_number = ? AND task_id = ?', [openid, dayNumber, taskId]);
    if (existing) {
      return res.status(400).json({ error: '今天已经打卡了' });
    }
    
    await dbAsync.run('INSERT INTO checkin_records (openid, day_number, task_id, proof) VALUES (?, ?, ?, ?)', [openid, dayNumber, taskId, proof]);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '打卡失败' });
  }
});

// 获取打卡进度
app.get('/api/checkin/progress', async (req, res) => {
  const { openid } = req.query;
  
  try {
    const records = await dbAsync.all('SELECT * FROM checkin_records WHERE openid = ? ORDER BY day_number', [openid]);
    const totalDays = 21;
    const completedDays = new Set(records.map(r => r.day_number)).size;
    
    res.json({
      totalDays,
      completedDays,
      progress: Math.round((completedDays / totalDays) * 100),
      records
    });
  } catch (err) {
    res.status(500).json({ error: '获取进度失败' });
  }
});

// ===== 管理后台API =====

// 管理员登录
app.post('/admin/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const admin = await dbAsync.get('SELECT * FROM admins WHERE username = ?', [username]);
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: '登录失败' });
  }
});

// 获取统计数据（公开接口，无需认证）
app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await dbAsync.get('SELECT COUNT(*) as count FROM users');
    const totalQuiz = await dbAsync.get('SELECT COUNT(*) as count FROM quiz_records');
    const totalWorks = await dbAsync.get('SELECT COUNT(*) as count FROM works');
    const totalCheckin = await dbAsync.get('SELECT COUNT(*) as count FROM checkin_records');
    const pendingWorks = await dbAsync.get('SELECT COUNT(*) as count FROM works WHERE status = ?', ['pending']);
    const totalPrizes = await dbAsync.get('SELECT SUM(remaining) as total FROM prizes');
    
    res.json({
      totalUsers: totalUsers.count,
      totalQuiz: totalQuiz.count,
      totalWorks: totalWorks.count,
      totalCheckin: totalCheckin.count,
      pendingWorks: pendingWorks.count,
      totalPrizes: totalPrizes.total || 0
    });
  } catch (err) {
    res.status(500).json({ error: '获取统计失败' });
  }
});

// 题库管理
app.get('/admin/api/questions', authMiddleware, async (req, res) => {
  try {
    const questions = await dbAsync.all('SELECT * FROM questions ORDER BY id DESC');
    res.json(questions.map(q => ({ ...q, options: JSON.parse(q.options) })));
  } catch (err) {
    res.status(500).json({ error: '获取题目失败' });
  }
});

app.post('/admin/api/questions', authMiddleware, async (req, res) => {
  const { category, type, question, options, answer, explanation } = req.body;
  
  try {
    const result = await dbAsync.run('INSERT INTO questions (category, type, question, options, answer, explanation) VALUES (?, ?, ?, ?, ?, ?)', [category, type, question, JSON.stringify(options), answer, explanation]);
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: '添加题目失败' });
  }
});

app.delete('/admin/api/questions/:id', authMiddleware, async (req, res) => {
  try {
    await dbAsync.run('DELETE FROM questions WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除题目失败' });
  }
});

// 作品审核
app.get('/admin/api/works', authMiddleware, async (req, res) => {
  const status = req.query.status || 'pending';
  try {
    const works = await dbAsync.all(`
      SELECT w.*, u.name as author_name, u.school 
      FROM works w 
      LEFT JOIN users u ON w.openid = u.openid 
      WHERE w.status = ?
      ORDER BY w.created_at DESC
    `, [status]);
    
    res.json(works.map(w => ({ ...w, images: w.images ? JSON.parse(w.images) : [] })));
  } catch (err) {
    res.status(500).json({ error: '获取作品失败' });
  }
});

app.put('/admin/api/works/:id', authMiddleware, async (req, res) => {
  const { status } = req.body;
  try {
    await dbAsync.run('UPDATE works SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '审核失败' });
  }
});

// 奖品管理
app.get('/admin/api/prizes', authMiddleware, async (req, res) => {
  try {
    const prizes = await dbAsync.all('SELECT * FROM prizes');
    res.json(prizes);
  } catch (err) {
    res.status(500).json({ error: '获取奖品失败' });
  }
});

app.post('/admin/api/prizes', authMiddleware, async (req, res) => {
  const { name, description, quantity, probability } = req.body;
  
  try {
    const result = await dbAsync.run('INSERT INTO prizes (name, description, quantity, remaining, probability) VALUES (?, ?, ?, ?, ?)', [name, description, quantity, quantity, probability]);
    res.json({ id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: '添加奖品失败' });
  }
});

app.put('/admin/api/prizes/:id', authMiddleware, async (req, res) => {
  const { name, description, quantity, probability } = req.body;
  try {
    const prize = await dbAsync.get('SELECT remaining, quantity FROM prizes WHERE id = ?', [req.params.id]);
    const diff = quantity - prize.quantity;
    
    await dbAsync.run('UPDATE prizes SET name = ?, description = ?, quantity = ?, remaining = remaining + ?, probability = ? WHERE id = ?', [name, description, quantity, diff, probability, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '更新奖品失败' });
  }
});

app.delete('/admin/api/prizes/:id', authMiddleware, async (req, res) => {
  try {
    await dbAsync.run('DELETE FROM prizes WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '删除奖品失败' });
  }
});

// 用户管理
app.get('/admin/api/users', authMiddleware, async (req, res) => {
  try {
    const users = await dbAsync.all('SELECT * FROM users ORDER BY created_at DESC');
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: '获取用户失败' });
  }
});

// 答题记录
app.get('/admin/api/quiz-records', authMiddleware, async (req, res) => {
  try {
    const records = await dbAsync.all(`
      SELECT qr.*, u.name, u.school, u.grade, u.class 
      FROM quiz_records qr 
      LEFT JOIN users u ON qr.openid = u.openid 
      ORDER BY qr.created_at DESC
    `);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: '获取记录失败' });
  }
});

// 打卡记录
app.get('/admin/api/checkin-records', authMiddleware, async (req, res) => {
  try {
    const records = await dbAsync.all(`
      SELECT cr.*, u.name, u.school, ct.title as task_title 
      FROM checkin_records cr 
      LEFT JOIN users u ON cr.openid = u.openid 
      LEFT JOIN checkin_tasks ct ON cr.task_id = ct.id
      ORDER BY cr.created_at DESC
    `);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: '获取打卡记录失败' });
  }
});

// 首页重定向
app.get('/', (req, res) => {
  res.redirect('/static/user/index.html');
});

// 管理后台路由
app.get('/admin', (req, res) => {
  res.redirect('/static/admin/login.html');
});

// 启动服务器
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`用户端: http://localhost:${PORT}/static/user/`);
    console.log(`管理后台: http://localhost:${PORT}/admin`);
  });
});

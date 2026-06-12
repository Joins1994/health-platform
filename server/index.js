const express = require('express');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');
const { dbAsync, initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'health-platform-secret-key-2024';

// 中间件
app.use(cors());

// 登录速率限制（每IP每分钟5次）
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '登录请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
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
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${uuidv4()}${ext}`;
    cb(null, uniqueName);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持上传图片（jpg/png/gif/webp）'));
    }
  }
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

// 用户认证中间件（从JWT获取openid，防止身份伪造）
function userAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userOpenid = decoded.openid;
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

// ===== 用户注册/登录模块 =====

// 注册（手机号+密码+个人信息）
app.post('/api/register', async (req, res) => {
  const { phone, password, name, school, grade, class: className } = req.body;
  
  if (!phone || !password || !name || !school || !grade || !className) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: '请输入正确的手机号' });
  }
  
  try {
    const existing = await dbAsync.get('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existing) {
      return res.status(400).json({ error: '该手机号已注册' });
    }
    
    const hashedPassword = bcrypt.hashSync(password, 10);
    const openid = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    await dbAsync.run(
      'INSERT INTO users (openid, phone, password, name, school, grade, class) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [openid, phone, hashedPassword, name, school, grade, className]
    );
    
    const user = await dbAsync.get('SELECT id, openid, phone, name, school, grade, class FROM users WHERE phone = ?', [phone]);
    const token = jwt.sign({ userId: user.id, openid: user.openid, phone }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({ token, user });
  } catch (err) {
    console.error('注册错误:', err);
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录（手机号+密码）
app.post('/api/login', loginLimiter, async (req, res) => {
  const { phone, password } = req.body;
  
  if (!phone || !password) {
    return res.status(400).json({ error: '请输入手机号和密码' });
  }
  
  try {
    const user = await dbAsync.get('SELECT * FROM users WHERE phone = ?', [phone]);
    if (!user || !user.password) {
      return res.status(401).json({ error: '手机号或密码错误' });
    }
    
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '手机号或密码错误' });
    }
    
    const token = jwt.sign({ userId: user.id, openid: user.openid, phone }, JWT_SECRET, { expiresIn: '30d' });
    
    res.json({
      token,
      user: { id: user.id, openid: user.openid, phone: user.phone, name: user.name, school: user.school, grade: user.grade, class: user.class }
    });
  } catch (err) {
    console.error('登录错误:', err);
    res.status(500).json({ error: '登录失败' });
  }
});

// 获取当前用户信息（需登录）
app.get('/api/user/profile', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await dbAsync.get('SELECT id, openid, phone, name, school, grade, class FROM users WHERE id = ?', [decoded.userId]);
    res.json(user || {});
  } catch (err) {
    res.status(401).json({ error: '登录已过期，请重新登录' });
  }
});

// 修改个人信息
app.post('/api/user/update-profile', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { name, school, grade, class: className } = req.body;
    await dbAsync.run(
      'UPDATE users SET name = ?, school = ?, grade = ?, class = ? WHERE id = ?',
      [name, school, grade, className, decoded.userId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '修改失败' });
  }
});

// 修改密码
app.post('/api/user/change-password', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: '未登录' });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { oldPassword, newPassword } = req.body;
    
    const user = await dbAsync.get('SELECT password FROM users WHERE id = ?', [decoded.userId]);
    if (!user || !bcrypt.compareSync(oldPassword, user.password)) {
      return res.status(400).json({ error: '当前密码错误' });
    }
    
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await dbAsync.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, decoded.userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '修改失败' });
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
app.post('/api/quiz/submit', userAuth, async (req, res) => {
  const openid = req.userOpenid;
  const { category, answers } = req.body;
  
  if (!answers || answers.length === 0) {
    return res.status(400).json({ error: '请提交答案' });
  }
  const results = [];
  let correct = 0;
  
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

// 抽奖（需答题全对才能参与）
app.post('/api/quiz/lottery', userAuth, async (req, res) => {
  const openid = req.userOpenid;
  
  try {
    // 校验是否有答题全对记录
    const passedRecord = await dbAsync.get('SELECT id FROM quiz_records WHERE openid = ? AND score = total AND prize IS NULL ORDER BY id DESC LIMIT 1', [openid]);
    if (!passedRecord) {
      return res.status(400).json({ error: '需要答题全对才能抽奖', prize: null, redeem_code: null });
    }
    
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
    
    let redeemCode = null;
    
    if (selectedPrize) {
      await dbAsync.run('UPDATE prizes SET remaining = remaining - 1 WHERE id = ?', [selectedPrize.id]);
      // 生成兑换码：HP + 年月日 + 4位随机数
      redeemCode = 'HP' + new Date().toISOString().slice(0,10).replace(/-/g,'') + Math.random().toString(36).substr(2,4).toUpperCase();
      // SQLite不支持UPDATE ORDER BY LIMIT，用子查询实现
      await dbAsync.run(
        'UPDATE quiz_records SET prize = ?, prize_status = \'pending\', redeem_code = ? WHERE rowid = (SELECT rowid FROM quiz_records WHERE openid = ? AND prize IS NULL ORDER BY id DESC LIMIT 1)',
        [selectedPrize.name, redeemCode, openid]
      );
    }
    
    res.json({ 
      prize: selectedPrize ? { name: selectedPrize.name, description: selectedPrize.description } : null,
      redeem_code: redeemCode
    });
  } catch (err) {
    console.error('抽奖错误:', err);
    res.status(500).json({ error: '抽奖失败' });
  }
});

// 身份登记
app.post('/api/quiz/register', userAuth, async (req, res) => {
  const openid = req.userOpenid;
  const { name, school, grade, class: className, phone } = req.body;
  
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
app.post('/api/works', userAuth, upload.array('images', 6), async (req, res) => {
  const openid = req.userOpenid;
  const { title, description } = req.body;
  const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
  
  try {
    const result = await dbAsync.run('INSERT INTO works (openid, title, description, images) VALUES (?, ?, ?, ?)', [openid, title, description, JSON.stringify(images)]);
    res.json({ id: result.lastID, success: true });
  } catch (err) {
    res.status(500).json({ error: '提交作品失败' });
  }
});

// 投票
app.post('/api/works/:id/vote', userAuth, async (req, res) => {
  const { id } = req.params;
  const openid = req.userOpenid;
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
app.post('/api/checkin', userAuth, upload.single('proof'), async (req, res) => {
  const openid = req.userOpenid;
  const { dayNumber, taskId } = req.body;
  const proof = req.file ? `/uploads/${req.file.filename}` : req.body.proof || '';
  
  try {
    const day = parseInt(dayNumber);
    const task = parseInt(taskId);
    
    if (!openid || isNaN(day) || isNaN(task)) {
      return res.status(400).json({ error: '参数不完整' });
    }
    
    if (day < 1 || day > 21) {
      return res.status(400).json({ error: '天数无效' });
    }
    
    const existing = await dbAsync.get('SELECT id FROM checkin_records WHERE openid = ? AND day_number = ? AND task_id = ?', [openid, day, task]);
    if (existing) {
      return res.status(400).json({ error: '今天已经打卡了' });
    }
    
    await dbAsync.run('INSERT INTO checkin_records (openid, day_number, task_id, proof) VALUES (?, ?, ?, ?)', [openid, day, task, proof]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('打卡错误:', err);
    res.status(500).json({ error: '打卡失败' });
  }
});

// 获取打卡进度
app.get('/api/checkin/progress', userAuth, async (req, res) => {
  const openid = req.userOpenid;
  
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
app.post('/admin/api/login', loginLimiter, async (req, res) => {
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
    const pendingClaims = await dbAsync.get('SELECT COUNT(*) as count FROM quiz_records WHERE prize IS NOT NULL AND prize != \'\' AND prize_status = \'pending\'');
    
    res.json({
      totalUsers: totalUsers.count,
      totalQuiz: totalQuiz.count,
      totalWorks: totalWorks.count,
      totalCheckin: totalCheckin.count,
      pendingWorks: pendingWorks.count,
      totalPrizes: totalPrizes.total || 0,
      pendingClaims: pendingClaims.count
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

// 编辑题目
app.put('/admin/api/questions/:id', authMiddleware, async (req, res) => {
  const { category, type, question, options, answer, explanation } = req.body;
  if (!category || !type || !question || !answer) {
    return res.status(400).json({ error: '请填写完整信息' });
  }
  try {
    await dbAsync.run(
      'UPDATE questions SET category = ?, type = ?, question = ?, options = ?, answer = ?, explanation = ? WHERE id = ?',
      [category, type, question, JSON.stringify(options || []), answer, explanation || '', req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('编辑题目失败:', err);
    res.status(500).json({ error: '编辑题目失败' });
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
    if (!prize) return res.status(404).json({ error: '奖品不存在' });
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

// 用户管理（支持分页、搜索）
app.get('/admin/api/users', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, keyword = '' } = req.query;
    const offset = (page - 1) * limit;
    
    let where = '';
    let params = [];
    if (keyword) {
      where = 'WHERE u.name LIKE ? OR u.school LIKE ? OR u.phone LIKE ?';
      params = [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`];
    }
    
    const users = await dbAsync.all(`
      SELECT u.id, u.openid, u.phone, u.name, u.school, u.grade, u.class, u.created_at,
        (SELECT COUNT(*) FROM quiz_records WHERE openid = u.openid) as quiz_count,
        (SELECT COUNT(DISTINCT day_number) FROM checkin_records WHERE openid = u.openid) as checkin_days
      FROM users u ${where}
      ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);
    
    const total = await dbAsync.get(`SELECT COUNT(*) as count FROM users u ${where}`, params);
    
    res.json({ data: users, total: total.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('获取用户失败:', err);
    res.status(500).json({ error: '获取用户失败' });
  }
});

// 获取单个用户详情
app.get('/admin/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const user = await dbAsync.get(`
      SELECT u.id, u.openid, u.phone, u.name, u.school, u.grade, u.class, u.created_at,
        (SELECT COUNT(*) FROM quiz_records WHERE openid = u.openid) as quiz_count,
        (SELECT COUNT(DISTINCT day_number) FROM checkin_records WHERE openid = u.openid) as checkin_days,
        (SELECT COUNT(*) FROM works WHERE openid = u.openid) as works_count
      FROM users u WHERE u.id = ?
    `, [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    // 获取最近的打卡记录
    const recentCheckins = await dbAsync.all(`
      SELECT cr.*, ct.title as task_title 
      FROM checkin_records cr 
      LEFT JOIN checkin_tasks ct ON cr.task_id = ct.id 
      WHERE cr.openid = ? ORDER BY cr.created_at DESC LIMIT 10
    `, [user.openid]);
    
    // 获取最近的答题记录
    const recentQuiz = await dbAsync.all(`
      SELECT * FROM quiz_records WHERE openid = ? ORDER BY created_at DESC LIMIT 5
    `, [user.openid]);
    
    res.json({ ...user, recentCheckins, recentQuiz });
  } catch (err) {
    console.error('获取用户详情失败:', err);
    res.status(500).json({ error: '获取用户详情失败' });
  }
});

// 管理员重置用户密码
app.post('/admin/api/users/:id/reset-password', authMiddleware, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }
  try {
    const user = await dbAsync.get('SELECT id FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await dbAsync.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('重置密码失败:', err);
    res.status(500).json({ error: '重置密码失败' });
  }
});

// 删除用户（同时清理关联数据）
app.delete('/admin/api/users/:id', authMiddleware, async (req, res) => {
  try {
    const user = await dbAsync.get('SELECT openid FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    
    await dbAsync.run('DELETE FROM quiz_records WHERE openid = ?', [user.openid]);
    await dbAsync.run('DELETE FROM checkin_records WHERE openid = ?', [user.openid]);
    await dbAsync.run('DELETE FROM works WHERE openid = ?', [user.openid]);
    await dbAsync.run('DELETE FROM vote_records WHERE openid = ?', [user.openid]);
    await dbAsync.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('删除用户失败:', err);
    res.status(500).json({ error: '删除用户失败' });
  }
});

// 清理预览：查看将被清理的用户
app.get('/admin/api/users/cleanup-preview', authMiddleware, async (req, res) => {
  try {
    // 严格条件：同时没有手机号、密码、姓名，即从未通过新系统注册的用户
    const users = await dbAsync.all(`
      SELECT u.id, u.openid, u.phone, u.name, u.school, u.created_at,
        (SELECT COUNT(*) FROM quiz_records WHERE openid = u.openid) as quiz_count,
        (SELECT COUNT(*) FROM checkin_records WHERE openid = u.openid) as checkin_count
      FROM users u
      WHERE u.phone IS NULL AND u.password IS NULL AND u.name IS NULL
      ORDER BY u.created_at ASC
    `);
    res.json(users);
  } catch (err) {
    console.error('预览失败:', err);
    res.status(500).json({ error: '预览失败' });
  }
});

// 执行清理（需要提供确认参数）
app.post('/admin/api/users/cleanup', authMiddleware, async (req, res) => {
  const { confirmCount } = req.body;
  
  try {
    // 先预览数量
    const preview = await dbAsync.get('SELECT COUNT(*) as count FROM users WHERE phone IS NULL AND password IS NULL AND name IS NULL');
    const count = preview.count;
    
    if (count === 0) {
      return res.json({ success: true, deleted: 0, message: '没有需要清理的用户' });
    }
    
    // 必须确认数量一致才执行（防止误操作）
    if (!confirmCount || parseInt(confirmCount) !== count) {
      return res.status(400).json({ 
        error: `确认数量不匹配。当前有 ${count} 条待清理数据，请确认数量后重试。`,
        pendingCount: count 
      });
    }
    
    // 收集要删除的openid
    const toDelete = await dbAsync.all('SELECT openid FROM users WHERE phone IS NULL AND password IS NULL AND name IS NULL');
    const openids = toDelete.map(u => u.openid);
    
    // 逐个删除关联数据（SQLite不支持IN中大量参数的替代方案）
    for (const openid of openids) {
      await dbAsync.run('DELETE FROM quiz_records WHERE openid = ?', [openid]);
      await dbAsync.run('DELETE FROM checkin_records WHERE openid = ?', [openid]);
      await dbAsync.run('DELETE FROM works WHERE openid = ?', [openid]);
      await dbAsync.run('DELETE FROM vote_records WHERE openid = ?', [openid]);
    }
    
    // 删除用户
    const result = await dbAsync.run('DELETE FROM users WHERE phone IS NULL AND password IS NULL AND name IS NULL');
    
    res.json({ success: true, deleted: result.changes });
  } catch (err) {
    console.error('清理失败:', err);
    res.status(500).json({ error: '清理失败' });
  }
});

// 答题记录（支持分页）
app.get('/admin/api/quiz-records', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const records = await dbAsync.all(`
      SELECT qr.*, u.name, u.school, u.grade, u.class, u.phone
      FROM quiz_records qr 
      LEFT JOIN users u ON qr.openid = u.openid 
      ORDER BY qr.created_at DESC LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);
    
    const total = await dbAsync.get('SELECT COUNT(*) as count FROM quiz_records');
    res.json({ data: records, total: total.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('获取记录失败:', err);
    res.status(500).json({ error: '获取记录失败' });
  }
});

// 打卡记录（支持分页）
app.get('/admin/api/checkin-records', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const records = await dbAsync.all(`
      SELECT cr.*, u.name, u.school, u.grade, u.class, u.phone
      FROM checkin_records cr 
      LEFT JOIN users u ON cr.openid = u.openid 
      LEFT JOIN checkin_tasks ct ON cr.task_id = ct.id
      ORDER BY cr.created_at DESC LIMIT ? OFFSET ?
    `, [parseInt(limit), parseInt(offset)]);
    
    const total = await dbAsync.get('SELECT COUNT(*) as count FROM checkin_records');
    res.json({ data: records, total: total.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('获取打卡记录失败:', err);
    res.status(500).json({ error: '获取打卡记录失败' });
  }
});

// ===== 领奖核销模块 =====

// 获取待核销列表（管理后台，支持分页）
app.get('/admin/api/claims', authMiddleware, async (req, res) => {
  const status = req.query.status || 'pending';
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const records = await dbAsync.all(`
      SELECT qr.*, u.name, u.school, u.grade, u.class, u.phone
      FROM quiz_records qr 
      LEFT JOIN users u ON qr.openid = u.openid 
      WHERE qr.prize IS NOT NULL AND qr.prize != '' AND qr.prize_status = ?
      ORDER BY qr.created_at DESC LIMIT ? OFFSET ?
    `, [status, parseInt(limit), parseInt(offset)]);
    
    const total = await dbAsync.get('SELECT COUNT(*) as count FROM quiz_records WHERE prize IS NOT NULL AND prize != \'\' AND prize_status = ?', [status]);
    res.json({ data: records, total: total.count, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('获取核销记录失败:', err);
    res.status(500).json({ error: '获取核销记录失败' });
  }
});

// 执行核销（管理后台）
app.put('/admin/api/claims/:id', authMiddleware, async (req, res) => {
  const { action } = req.body; // 'claim' 核销 | 'reject' 拒绝
  try {
    if (action === 'claim') {
      await dbAsync.run(
        'UPDATE quiz_records SET prize_status = \'claimed\', claimed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [req.params.id]
      );
    } else if (action === 'reject') {
      await dbAsync.run(
        'UPDATE quiz_records SET prize_status = \'rejected\' WHERE id = ?',
        [req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '核销操作失败' });
  }
});

// 用户查看自己的奖品
app.get('/api/my-prizes', userAuth, async (req, res) => {
  const openid = req.userOpenid;
  try {
    const records = await dbAsync.all(`
      SELECT id, prize, prize_status, redeem_code, claimed_at, created_at
      FROM quiz_records 
      WHERE openid = ? AND prize IS NOT NULL AND prize != ''
      ORDER BY created_at DESC
    `, [openid]);
    res.json(records);
  } catch (err) {
    res.status(500).json({ error: '获取奖品失败' });
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

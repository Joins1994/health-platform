const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, 'health_platform.db');

// 使用同步方式打开数据库
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err);
  } else {
    console.log('数据库连接成功');
  }
});

// 将数据库操作包装为Promise
const dbAsync = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  exec(sql) {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

async function initDatabase() {
  try {
    // 用户表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT UNIQUE,
        phone TEXT UNIQUE,
        password TEXT,
        name TEXT,
        school TEXT,
        grade TEXT,
        class TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 题库表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        type TEXT NOT NULL,
        question TEXT NOT NULL,
        options TEXT NOT NULL,
        answer TEXT NOT NULL,
        explanation TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 答题记录表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS quiz_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT NOT NULL,
        category TEXT NOT NULL,
        score INTEGER NOT NULL,
        total INTEGER NOT NULL,
        prize TEXT,
        prize_status TEXT DEFAULT 'pending',
        redeem_code TEXT,
        user_info TEXT,
        claimed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 奖品配置表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS prizes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        quantity INTEGER NOT NULL DEFAULT 0,
        remaining INTEGER NOT NULL DEFAULT 0,
        probability REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 作品表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS works (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        images TEXT,
        video TEXT,
        votes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 投票记录表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS vote_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT NOT NULL,
        work_id INTEGER NOT NULL,
        vote_date DATE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 打卡任务表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS checkin_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        day_number INTEGER NOT NULL,
        task_order INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 打卡记录表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS checkin_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        openid TEXT NOT NULL,
        day_number INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        proof TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 管理员表
    await dbAsync.exec(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 初始化管理员
    const bcrypt = require('bcryptjs');
    const adminExists = await dbAsync.get('SELECT id FROM admins WHERE username = ?', ['admin']);
    if (!adminExists) {
      const hash = bcrypt.hashSync('admin123', 10);
      await dbAsync.run('INSERT INTO admins (username, password) VALUES (?, ?)', ['admin', hash]);
    }

    // 初始化打卡任务（21天）
    const taskCount = await dbAsync.get('SELECT COUNT(*) as count FROM checkin_tasks');
    if (taskCount.count === 0) {
      await initCheckinTasks();
    }

    // 兼容旧数据库：添加缺失的列
    try { await dbAsync.run('ALTER TABLE users ADD COLUMN password TEXT'); } catch(e) {}
    try { await dbAsync.run('ALTER TABLE quiz_records ADD COLUMN redeem_code TEXT'); } catch(e) {}
    try { await dbAsync.run('ALTER TABLE quiz_records ADD COLUMN claimed_at DATETIME'); } catch(e) {}

    // 初始化示例题目
    const questionCount = await dbAsync.get('SELECT COUNT(*) as count FROM questions');
    if (questionCount.count === 0) {
      await initSampleQuestions();
    }

    // 初始化示例奖品
    const prizeCount = await dbAsync.get('SELECT COUNT(*) as count FROM prizes');
    if (prizeCount.count === 0) {
      await initSamplePrizes();
    }

    console.log('数据库初始化完成');
  } catch (err) {
    console.error('数据库初始化失败:', err);
  }
}

async function initCheckinTasks() {
  const tasks = [
    // 第1周：睡眠充足
    { day: 1, order: 1, title: '早睡早起', desc: '今晚22:30前上床睡觉，明早7:00前起床' },
    { day: 2, order: 1, title: '睡前准备', desc: '睡前1小时不使用电子设备，可以阅读纸质书' },
    { day: 3, order: 1, title: '规律作息', desc: '制定自己的作息时间表并严格执行' },
    // 第2周：均衡饮食
    { day: 4, order: 1, title: '营养早餐', desc: '今天早餐包含谷物、蛋白质和水果' },
    { day: 5, order: 1, title: '少吃零食', desc: '今天不吃薯片、糖果等高糖高盐零食' },
    { day: 6, order: 1, title: '多吃蔬果', desc: '今天吃至少3种不同颜色的蔬菜和水果' },
    // 第3周：积极运动
    { day: 7, order: 1, title: '户外运动', desc: '今天进行30分钟以上的户外运动' },
    { day: 8, order: 1, title: '眼保健操', desc: '认真做2次眼保健操，保护视力' },
    { day: 9, order: 1, title: '运动打卡', desc: '记录今天的运动内容和时长' },
    // 第4周：卫生习惯
    { day: 10, order: 1, title: '正确洗手', desc: '饭前便后使用七步洗手法洗手' },
    { day: 11, order: 1, title: '口腔卫生', desc: '早晚刷牙，每次不少于2分钟' },
    { day: 12, order: 1, title: '个人清洁', desc: '勤洗澡、勤换衣，保持个人卫生' },
    // 第5周：心理健康
    { day: 13, order: 1, title: '情绪管理', desc: '今天遇到不开心的事，尝试深呼吸调节情绪' },
    { day: 14, order: 1, title: '与人沟通', desc: '主动与家人或朋友分享一件开心的事' },
    { day: 15, order: 1, title: '放松时刻', desc: '做一件让自己放松的事情，如听音乐、画画' },
    // 第6周：安全自护
    { day: 16, order: 1, title: '交通安全', desc: '上下学遵守交通规则，走人行道' },
    { day: 17, order: 1, title: '网络安全', desc: '不随意点击陌生链接，保护个人信息' },
    { day: 18, order: 1, title: '应急知识', desc: '学习一个急救小知识并分享给家人' },
    // 第7周：总结提升
    { day: 19, order: 1, title: '健康日记', desc: '写一篇21天健康打卡心得' },
    { day: 20, order: 1, title: '习惯巩固', desc: '回顾并坚持前面养成的健康习惯' },
    { day: 21, order: 1, title: '健康达人', desc: '完成21天打卡，成为健康小达人！' }
  ];

  for (const t of tasks) {
    await dbAsync.run(
      'INSERT INTO checkin_tasks (day_number, task_order, title, description) VALUES (?, ?, ?, ?)',
      [t.day, t.order, t.title, t.desc]
    );
  }
}

async function initSampleQuestions() {
  const questions = [
    // ===== 小学低年级（1-3年级）8题 =====
    {
      category: 'primary_low',
      type: 'single',
      question: '每天应该刷几次牙？',
      options: JSON.stringify(['1次', '2次', '3次', '不用刷']),
      answer: 'B',
      explanation: '早晚各刷一次牙，每次不少于2分钟。'
    },
    {
      category: 'primary_low',
      type: 'single',
      question: '以下哪种食物最健康？',
      options: JSON.stringify(['薯片', '糖果', '苹果', '可乐']),
      answer: 'C',
      explanation: '苹果富含维生素和纤维，是最健康的零食选择。'
    },
    {
      category: 'primary_low',
      type: 'judge',
      question: '看电视时可以离电视很近。',
      options: JSON.stringify(['正确', '错误']),
      answer: 'B',
      explanation: '看电视要保持适当距离，至少2-3米远。'
    },
    {
      category: 'primary_low',
      type: 'single',
      question: '饭前应该做什么？',
      options: JSON.stringify(['直接吃饭', '洗手', '玩手机', '吃零食']),
      answer: 'B',
      explanation: '饭前要洗手，防止细菌进入体内。'
    },
    {
      category: 'primary_low',
      type: 'single',
      question: '每天应该睡多少个小时？',
      options: JSON.stringify(['4小时', '6小时', '10小时', '3小时']),
      answer: 'C',
      explanation: '小学生每天应保证10小时左右的睡眠时间。'
    },
    {
      category: 'primary_low',
      type: 'judge',
      question: '多吃蔬菜水果对身体好。',
      options: JSON.stringify(['正确', '错误']),
      answer: 'A',
      explanation: '蔬菜水果富含维生素和矿物质，有助于健康成长。'
    },
    {
      category: 'primary_low',
      type: 'single',
      question: '以下哪种行为是不对的？',
      options: JSON.stringify(['早睡早起', '挑食偏食', '多喝白开水', '经常运动']),
      answer: 'B',
      explanation: '挑食偏食会导致营养不均衡，影响身体发育。'
    },
    {
      category: 'primary_low',
      type: 'single',
      question: '保护眼睛，看书时眼睛离书本应该有多远？',
      options: JSON.stringify(['5厘米', '10厘米', '30厘米左右', '贴着看']),
      answer: 'C',
      explanation: '看书时眼睛离书本约30厘米（一尺），保护视力。'
    },

    // ===== 小学高年级（4-6年级）8题 =====
    {
      category: 'primary_high',
      type: 'single',
      question: '预防近视，以下哪项最重要？',
      options: JSON.stringify(['多吃胡萝卜', '每天户外活动2小时', '少喝水', '多看电视']),
      answer: 'B',
      explanation: '每天户外活动2小时是预防近视最有效的方法。'
    },
    {
      category: 'primary_high',
      type: 'single',
      question: '人体每天需要喝多少水？',
      options: JSON.stringify(['100毫升', '500毫升', '1000-1500毫升', '3000毫升']),
      answer: 'C',
      explanation: '中小学生每天应饮水1000-1500毫升。'
    },
    {
      category: 'primary_high',
      type: 'single',
      question: '以下哪个是良好的用眼习惯？',
      options: JSON.stringify(['在昏暗灯光下看书', '连续看书2小时不休息', '每看书40分钟休息10分钟', '躺着看书']),
      answer: 'C',
      explanation: '每看书40分钟应休息10分钟，远眺放松眼睛。'
    },
    {
      category: 'primary_high',
      type: 'judge',
      question: '早餐是一天中最重要的一餐，不吃早餐没关系。',
      options: JSON.stringify(['正确', '错误']),
      answer: 'B',
      explanation: '早餐提供一天所需的能量和营养，不吃早餐会影响学习效率和身体健康。'
    },
    {
      category: 'primary_high',
      type: 'single',
      question: '流感的主要传播途径是什么？',
      options: JSON.stringify(['食物传播', '蚊虫叮咬', '飞沫传播', '血液传播']),
      answer: 'C',
      explanation: '流感主要通过飞沫传播，如咳嗽、打喷嚏时产生的飞沫。'
    },
    {
      category: 'primary_high',
      type: 'multiple',
      question: '以下哪些属于个人卫生习惯？（多选）',
      options: JSON.stringify(['勤洗手', '勤洗澡', '不随地吐痰', '共用毛巾']),
      answer: 'ABC',
      explanation: '勤洗手、勤洗澡、不随地吐痰都是良好卫生习惯，共用毛巾容易传播疾病。'
    },
    {
      category: 'primary_high',
      type: 'single',
      question: '遇到同学溺水时，你应该怎么做？',
      options: JSON.stringify(['自己跳下去救人', '在岸上大声呼救找大人', '假装没看见', '回家告诉家长']),
      answer: 'B',
      explanation: '小学生不应下水救人，应大声呼救并寻找大人帮助。'
    },
    {
      category: 'primary_high',
      type: 'single',
      question: '以下哪种食物属于优质蛋白质来源？',
      options: JSON.stringify(['炸鸡', '鸡蛋', '薯条', '蛋糕']),
      answer: 'B',
      explanation: '鸡蛋富含优质蛋白质，是生长发育的重要营养来源。'
    },

    // ===== 初中（7-9年级）8题 =====
    {
      category: 'middle',
      type: 'single',
      question: '青春期身高增长最快的阶段是？',
      options: JSON.stringify(['婴儿期', '幼儿期', '青春期', '成年期']),
      answer: 'C',
      explanation: '青春期是身高增长的第二个高峰期。'
    },
    {
      category: 'middle',
      type: 'multiple',
      question: '以下哪些是健康的生活方式？（多选）',
      options: JSON.stringify(['规律作息', '均衡饮食', '适度运动', '熬夜打游戏']),
      answer: 'ABC',
      explanation: '规律作息、均衡饮食和适度运动是健康生活方式的三大支柱。'
    },
    {
      category: 'middle',
      type: 'single',
      question: '青少年正常的BMI范围是？',
      options: JSON.stringify(['小于15', '15-18.5', '18.5-24', '大于28']),
      answer: 'C',
      explanation: '青少年BMI在18.5-24之间属于正常范围。'
    },
    {
      category: 'middle',
      type: 'single',
      question: '以下哪种做法可以有效预防脊柱侧弯？',
      options: JSON.stringify(['长期单肩背包', '保持正确坐姿', '趴着写字', '歪头看书']),
      answer: 'B',
      explanation: '保持正确坐姿、双肩均衡受力可以有效预防脊柱侧弯。'
    },
    {
      category: 'middle',
      type: 'judge',
      question: '青春期长痘痘是因为不注意卫生导致的，只要多洗脸就能好。',
      options: JSON.stringify(['正确', '错误']),
      answer: 'B',
      explanation: '长痘痘主要与青春期激素分泌旺盛有关，保持清洁有帮助但不能完全避免。'
    },
    {
      category: 'middle',
      type: 'multiple',
      question: '以下哪些是传染病的预防措施？（多选）',
      options: JSON.stringify(['接种疫苗', '勤开窗通风', '不去人群密集场所', '与病人共用餐具']),
      answer: 'ABC',
      explanation: '接种疫苗、通风、避免去人群密集处都是有效的预防措施。'
    },
    {
      category: 'middle',
      type: 'single',
      question: '世界无烟日是哪一天？',
      options: JSON.stringify(['5月1日', '5月31日', '6月1日', '6月5日']),
      answer: 'B',
      explanation: '世界无烟日是每年的5月31日。'
    },
    {
      category: 'middle',
      type: 'single',
      question: '以下哪种情绪调节方法最健康？',
      options: JSON.stringify(['生闷气', '找朋友倾诉', '摔东西', '暴饮暴食']),
      answer: 'B',
      explanation: '找朋友倾诉是健康的情绪调节方式，有助于释放压力。'
    },

    // ===== 高中（10-12年级）8题 =====
    {
      category: 'high',
      type: 'single',
      question: 'BMI指数的计算公式是？',
      options: JSON.stringify(['体重/身高', '体重/(身高²)', '身高/体重', '体重×身高']),
      answer: 'B',
      explanation: 'BMI = 体重(kg) / 身高(m)²，是衡量体重是否正常的指标。'
    },
    {
      category: 'high',
      type: 'multiple',
      question: '以下哪些属于心理健康的表现？（多选）',
      options: JSON.stringify(['情绪稳定', '人际关系良好', '适应能力强', '经常焦虑不安']),
      answer: 'ABC',
      explanation: '心理健康包括情绪稳定、良好的人际关系和适应能力。'
    },
    {
      category: 'high',
      type: 'single',
      question: '人体最大的器官是什么？',
      options: JSON.stringify(['心脏', '肝脏', '皮肤', '大脑']),
      answer: 'C',
      explanation: '皮肤是人体最大的器官，具有保护、调节体温等功能。'
    },
    {
      category: 'high',
      type: 'multiple',
      question: '以下哪些是艾滋病的主要传播途径？（多选）',
      options: JSON.stringify(['血液传播', '母婴传播', '性接触传播', '握手拥抱']),
      answer: 'ABC',
      explanation: '艾滋病通过血液、母婴和性接触传播，日常接触不会传播。'
    },
    {
      category: 'high',
      type: 'single',
      question: '正常成年人的心率范围是？',
      options: JSON.stringify(['40-60次/分', '60-100次/分', '100-120次/分', '120-140次/分']),
      answer: 'B',
      explanation: '正常成年人的静息心率为60-100次/分钟。'
    },
    {
      category: 'high',
      type: 'judge',
      question: '适量饮用红酒可以完全抵消吸烟对身体的危害。',
      options: JSON.stringify(['正确', '错误']),
      answer: 'B',
      explanation: '饮酒不能抵消吸烟的危害，吸烟对身体的损害是独立存在的。'
    },
    {
      category: 'high',
      type: 'single',
      question: '以下哪种行为容易导致胃病？',
      options: JSON.stringify(['规律饮食', '三餐定时', '暴饮暴食', '细嚼慢咽']),
      answer: 'C',
      explanation: '暴饮暴食会增加胃的负担，容易导致胃炎、胃溃疡等疾病。'
    },
    {
      category: 'high',
      type: 'multiple',
      question: '以下哪些是科学减压的方法？（多选）',
      options: JSON.stringify(['适量运动', '规律睡眠', '过度打游戏', '培养兴趣爱好']),
      answer: 'ABD',
      explanation: '适量运动、规律睡眠和培养兴趣爱好的减压方式是科学的，过度打游戏反而增加压力。'
    }
  ];

  for (const q of questions) {
    await dbAsync.run(
      'INSERT INTO questions (category, type, question, options, answer, explanation) VALUES (?, ?, ?, ?, ?, ?)',
      [q.category, q.type, q.question, q.options, q.answer, q.explanation]
    );
  }
}

async function initSamplePrizes() {
  const prizes = [
    { name: '健康大礼包', desc: '包含健康手册、文具套装', quantity: 50, probability: 0.33 },
    { name: '运动手环', desc: '智能运动手环一个', quantity: 20, probability: 0.33 },
    { name: '健康水杯', desc: '精美保温杯一个', quantity: 100, probability: 0.34 }
  ];

  for (const p of prizes) {
    await dbAsync.run(
      'INSERT INTO prizes (name, description, quantity, remaining, probability) VALUES (?, ?, ?, ?, ?)',
      [p.name, p.desc, p.quantity, p.quantity, p.probability]
    );
  }
}

module.exports = { db, dbAsync, initDatabase };

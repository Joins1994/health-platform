// 全局配置
const API_BASE = '';

// 用户认证
const Auth = {
  getOpenid() {
    let openid = localStorage.getItem('openid');
    if (!openid) {
      openid = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('openid', openid);
    }
    return openid;
  },

  async login() {
    const openid = this.getOpenid();
    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'mock_code' })
      });
      const data = await res.json();
      if (data.openid) {
        localStorage.setItem('openid', data.openid);
      }
      return data;
    } catch (err) {
      console.error('登录失败:', err);
      return { openid };
    }
  }
};

// API请求工具
const API = {
  async get(url) {
    const res = await fetch(`${API_BASE}${url}`);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }
    return res.json();
  },

  async postForm(url, formData) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      body: formData
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '请求失败');
    }
    return res.json();
  }
};

// 工具函数
const Utils = {
  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `alert alert-${type}`;
    toast.textContent = message;
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;min-width:200px;text-align:center;';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  formatDate(dateStr) {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  },

  getGradeLabel(category) {
    const map = {
      'primary_low': '小学低年级（1-3年级）',
      'primary_high': '小学高年级（4-6年级）',
      'middle': '初中（7-9年级）',
      'high': '高中（10-12年级）'
    };
    return map[category] || category;
  }
};

// 页面初始化
async function initApp() {
  await Auth.login();
}

// 底部导航
document.addEventListener('DOMContentLoaded', () => {
  const navHTML = `
    <nav class="nav-bottom">
      <a href="index.html" class="nav-item ${location.pathname.includes('index') ? 'active' : ''}">
        <span class="icon">🏠</span>
        <span>首页</span>
      </a>
      <a href="quiz.html" class="nav-item ${location.pathname.includes('quiz') ? 'active' : ''}">
        <span class="icon">📝</span>
        <span>答题</span>
      </a>
      <a href="works.html" class="nav-item ${location.pathname.includes('works') ? 'active' : ''}">
        <span class="icon">🎨</span>
        <span>作品</span>
      </a>
      <a href="checkin.html" class="nav-item ${location.pathname.includes('checkin') ? 'active' : ''}">
        <span class="icon">📅</span>
        <span>打卡</span>
      </a>
    </nav>
  `;
  
  const navContainer = document.getElementById('nav-bottom');
  if (navContainer) {
    navContainer.innerHTML = navHTML;
  }
});

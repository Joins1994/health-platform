// 全局配置
const API_BASE = '';

// 用户认证（手机号+密码登录）
const Auth = {
  getToken() {
    return localStorage.getItem('user_token');
  },

  getUser() {
    const data = localStorage.getItem('user_info');
    return data ? JSON.parse(data) : null;
  },

  getOpenid() {
    const user = this.getUser();
    return user ? user.openid : null;
  },

  isLoggedIn() {
    return !!this.getToken();
  },

  saveLogin(token, user) {
    localStorage.setItem('user_token', token);
    localStorage.setItem('user_info', JSON.stringify(user));
  },

  logout() {
    localStorage.removeItem('user_token');
    localStorage.removeItem('user_info');
    location.href = '/static/user/login.html';
  },

  // 需要登录才能访问，未登录跳转登录页
  requireAuth() {
    if (!this.isLoggedIn()) {
      location.href = '/static/user/login.html';
      return false;
    }
    return true;
  }
};

// API请求工具
const API = {
  async get(url) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        headers: Auth.getToken() ? { 'Authorization': `Bearer ${Auth.getToken()}` } : {}
      });
      if (res.status === 401) { Auth.logout(); throw new Error('请重新登录'); }
      if (!res.ok) {
        try { const err = await res.json(); throw new Error(err.error || '请求失败'); }
        catch (e) { if (e.message === '请求失败') throw e; throw new Error('请求失败'); }
      }
      return res.json();
    } catch (err) {
      if (err.message === '请重新登录') throw err;
      throw err;
    }
  },

  async post(url, data) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(Auth.getToken() ? { 'Authorization': `Bearer ${Auth.getToken()}` } : {})
        },
        body: JSON.stringify(data)
      });
      if (res.status === 401) { Auth.logout(); throw new Error('请重新登录'); }
      if (!res.ok) {
        try { const err = await res.json(); throw new Error(err.error || '请求失败'); }
        catch (e) { if (e.message !== '请求失败') throw e; throw new Error('请求失败'); }
      }
      return res.json();
    } catch (err) {
      if (err.message === '请重新登录') throw err;
      throw err;
    }
  },

  async postForm(url, formData) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: Auth.getToken() ? { 'Authorization': `Bearer ${Auth.getToken()}` } : {},
        body: formData
      });
      if (res.status === 401) { Auth.logout(); throw new Error('请重新登录'); }
      if (!res.ok) {
        try { const err = await res.json(); throw new Error(err.error || '请求失败'); }
        catch (e) { if (e.message !== '请求失败') throw e; throw new Error('请求失败'); }
      }
      return res.json();
    } catch (err) {
      if (err.message === '请重新登录') throw err;
      throw err;
    }
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
  if (!Auth.requireAuth()) return;
  // token存在性已检查，不再额外验证（API调用时会自动处理401）
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
      <a href="profile.html" class="nav-item ${location.pathname.includes('profile') ? 'active' : ''}">
        <span class="icon">👤</span>
        <span>我的</span>
      </a>
    </nav>
  `;
  
  const navContainer = document.getElementById('nav-bottom');
  if (navContainer) {
    navContainer.innerHTML = navHTML;
  }
});

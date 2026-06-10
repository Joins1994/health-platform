const API_BASE = '';

// 认证
const AdminAuth = {
  getToken() {
    return localStorage.getItem('admin_token');
  },

  setToken(token) {
    localStorage.setItem('admin_token', token);
  },

  logout() {
    localStorage.removeItem('admin_token');
    location.href = 'login.html';
  },

  checkAuth() {
    if (!this.getToken()) {
      location.href = 'login.html';
      return false;
    }
    return true;
  }
};

// API请求
const AdminAPI = {
  async get(url) {
    const res = await fetch(`${API_BASE}${url}`, {
      headers: { 'Authorization': `Bearer ${AdminAuth.getToken()}` }
    });
    if (res.status === 401) {
      AdminAuth.logout();
      return;
    }
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AdminAuth.getToken()}`
      },
      body: JSON.stringify(data)
    });
    if (res.status === 401) {
      AdminAuth.logout();
      return;
    }
    return res.json();
  },

  async put(url, data) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AdminAuth.getToken()}`
      },
      body: JSON.stringify(data)
    });
    if (res.status === 401) {
      AdminAuth.logout();
      return;
    }
    return res.json();
  },

  async delete(url) {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${AdminAuth.getToken()}` }
    });
    if (res.status === 401) {
      AdminAuth.logout();
      return;
    }
    return res.json();
  }
};

// 工具函数
const AdminUtils = {
  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  getGradeLabel(category) {
    const map = {
      'primary_low': '小学低年级',
      'primary_high': '小学高年级',
      'middle': '初中',
      'high': '高中'
    };
    return map[category] || category;
  },

  getQuestionTypeLabel(type) {
    const map = {
      'single': '单选题',
      'multiple': '多选题',
      'judge': '判断题'
    };
    return map[type] || type;
  }
};

// 侧边栏导航
document.addEventListener('DOMContentLoaded', () => {
  const sidebarHTML = `
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>🌱 <span>管理后台</span></h1>
      </div>
      <ul class="sidebar-menu">
        <li><a href="dashboard.html" class="${location.pathname.includes('dashboard') ? 'active' : ''}">
          📊 <span>仪表盘</span>
        </a></li>
        <li><a href="questions.html" class="${location.pathname.includes('questions') ? 'active' : ''}">
          📝 <span>题库管理</span>
        </a></li>
        <li><a href="works-review.html" class="${location.pathname.includes('works') ? 'active' : ''}">
          🎨 <span>作品审核</span>
        </a></li>
        <li><a href="prizes.html" class="${location.pathname.includes('prizes') ? 'active' : ''}">
          🎁 <span>奖品管理</span>
        </a></li>
        <li><a href="users.html" class="${location.pathname.includes('users') ? 'active' : ''}">
          👥 <span>用户管理</span>
        </a></li>
        <li><a href="records.html" class="${location.pathname.includes('records') ? 'active' : ''}">
          📋 <span>答题记录</span>
        </a></li>
        <li><a href="checkin-records.html" class="${location.pathname.includes('checkin') ? 'active' : ''}">
          📅 <span>打卡记录</span>
        </a></li>
        <li><a href="#" onclick="AdminAuth.logout(); return false;">
          🚪 <span>退出登录</span>
        </a></li>
      </ul>
    </div>
  `;
  
  const container = document.getElementById('sidebar-container');
  if (container) {
    container.innerHTML = sidebarHTML;
  }
});

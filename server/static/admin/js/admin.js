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
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        headers: { 'Authorization': `Bearer ${AdminAuth.getToken()}` }
      });
      if (res.status === 401) { AdminAuth.logout(); return null; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `请求失败(${res.status})`);
      }
      return res.json();
    } catch (err) {
      if (err.message.includes('请求失败') || err.message.includes('网络')) throw err;
      throw new Error(`网络错误: ${err.message}`);
    }
  },

  async post(url, data) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AdminAuth.getToken()}`
        },
        body: JSON.stringify(data)
      });
      if (res.status === 401) { AdminAuth.logout(); return null; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `请求失败(${res.status})`);
      }
      return res.json();
    } catch (err) {
      if (err.message.includes('请求失败') || err.message.includes('网络')) throw err;
      throw new Error(`网络错误: ${err.message}`);
    }
  },

  async put(url, data) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${AdminAuth.getToken()}`
        },
        body: JSON.stringify(data)
      });
      if (res.status === 401) { AdminAuth.logout(); return null; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `请求失败(${res.status})`);
      }
      return res.json();
    } catch (err) {
      if (err.message.includes('请求失败') || err.message.includes('网络')) throw err;
      throw new Error(`网络错误: ${err.message}`);
    }
  },

  async delete(url) {
    try {
      const res = await fetch(`${API_BASE}${url}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${AdminAuth.getToken()}` }
      });
      if (res.status === 401) { AdminAuth.logout(); return null; }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `请求失败(${res.status})`);
      }
      return res.json();
    } catch (err) {
      if (err.message.includes('请求失败') || err.message.includes('网络')) throw err;
      throw new Error(`网络错误: ${err.message}`);
    }
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
  },

  // 渲染分页控件
  renderPagination(containerId, total, page, limit, loadFn) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    
    let pages = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;">
        <span class="text-sm text-muted">共 ${total} 条</span>
        <div style="display:flex;gap:4px;">
          <button class="btn btn-outline btn-sm" ${page <= 1 ? 'disabled' : ''} onclick="${loadFn}(${page - 1})">上一页</button>
          ${pages.map(p => `<button class="btn btn-sm ${p === page ? 'btn-primary' : 'btn-outline'}" onclick="${loadFn}(${p})">${p}</button>`).join('')}
          <button class="btn btn-outline btn-sm" ${page >= totalPages ? 'disabled' : ''} onclick="${loadFn}(${page + 1})">下一页</button>
        </div>
      </div>
    `;
  },

  // 导出CSV
  exportCSV(filename, headers, rows) {
    const BOM = '\uFEFF';
    const csv = BOM + [headers.join(','), ...rows.map(r => r.map(c => `"${(c || '').toString().replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
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
        <li><a href="claims.html" class="${location.pathname.includes('claims') ? 'active' : ''}">
          🎫 <span>领奖核销</span>
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

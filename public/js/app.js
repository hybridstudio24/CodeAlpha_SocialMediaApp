(() => {
  const API = '/api';

  const state = {
    token: localStorage.getItem('kindling_token') || null,
    user: null,
    view: 'feed',
    viewedUsername: null, // for profile view
    activeThreadPostId: null,
  };

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const authScreen = $('#auth-screen');
  const appEl = $('#app');
  const toastEl = $('#toast');

  // ---------- helpers ----------
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toastEl.hidden = true; }, 2600);
  }

  function initials(name) {
    return (name || '?').slice(0, 2).toUpperCase();
  }

  function timeAgo(iso) {
    const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
    const diff = Math.max(0, Date.now() - then);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(then).toLocaleDateString();
  }

  async function api(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

    const res = await fetch(API + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let data = {};
    try { data = await res.json(); } catch (e) { /* empty body */ }

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  function setToken(token) {
    state.token = token;
    if (token) localStorage.setItem('kindling_token', token);
    else localStorage.removeItem('kindling_token');
  }

  // ---------- auth screen ----------
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.tab === 'login';
      $('#login-form').hidden = !isLogin;
      $('#register-form').hidden = isLogin;
    });
  });

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#login-error').textContent = '';
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { username: fd.get('username'), password: fd.get('password') },
      });
      setToken(data.token);
      state.user = data.user;
      enterApp();
    } catch (err) {
      $('#login-error').textContent = err.message;
    }
  });

  $('#register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    $('#register-error').textContent = '';
    try {
      const data = await api('/auth/register', {
        method: 'POST',
        body: {
          username: fd.get('username'),
          email: fd.get('email'),
          password: fd.get('password'),
        },
      });
      setToken(data.token);
      state.user = data.user;
      enterApp();
    } catch (err) {
      $('#register-error').textContent = err.message;
    }
  });

  $('#logout-btn').addEventListener('click', () => {
    setToken(null);
    state.user = null;
    appEl.hidden = true;
    authScreen.hidden = false;
  });

  // ---------- nav ----------
  document.querySelectorAll('.nav-link').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-link').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const view = btn.dataset.view;
      if (view === 'profile') {
        openProfile(state.user.username);
      } else {
        state.view = view;
        $('#profile-panel').hidden = true;
        $('#view-title').textContent = view === 'following' ? 'Following' : 'Feed';
        loadFeed();
      }
    });
  });

  // ---------- composer ----------
  $('#composer-submit').addEventListener('click', async () => {
    const input = $('#composer-input');
    const content = input.value.trim();
    if (!content) return;
    try {
      await api('/posts', { method: 'POST', body: { content } });
      input.value = '';
      showToast('Posted.');
      if (state.view === 'feed' || state.view === 'following') loadFeed();
      if (state.view === 'profile' && state.viewedUsername === state.user.username) {
        loadFeed();
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  // ---------- feed ----------
  async function loadFeed() {
    const list = $('#post-list');
    list.innerHTML = '<p class="empty-state">Loading…</p>';
    try {
      let path = '/posts';
      if (state.view === 'following') path += '?scope=following';
      const { posts } = await api(path);
      renderPosts(posts, list, {
        emptyMsg: state.view === 'following'
          ? 'No posts yet from people you follow. Try following someone!'
          : 'No posts yet. Be the first to share something.',
      });
    } catch (err) {
      list.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  function renderPosts(posts, container, { emptyMsg } = {}) {
    container.innerHTML = '';
    if (!posts.length) {
      container.innerHTML = `<p class="empty-state">${emptyMsg || 'Nothing here yet.'}</p>`;
      return;
    }
    posts.forEach((post) => container.appendChild(postCard(post)));
  }

  function postCard(post) {
    const card = document.createElement('div');
    card.className = 'post-card';

    const mine = state.user && post.author.id === state.user.id;

    card.innerHTML = `
      <div class="post-head">
        <div class="avatar">${initials(post.author.username)}</div>
        <div class="who">
          <button data-user="${post.author.username}" class="who-btn">${post.author.username}</button>
          <span class="when">${timeAgo(post.created_at)}</span>
        </div>
      </div>
      <p class="post-content"></p>
      <div class="post-actions">
        <button class="btn btn-sm like-btn ${post.liked_by_me ? 'liked' : ''}">
          ${post.liked_by_me ? '♥' : '♡'} <span class="like-count">${post.likes_count}</span>
        </button>
        <button class="btn btn-sm comment-btn">💬 <span>${post.comments_count}</span></button>
        ${mine ? '<button class="btn btn-sm post-delete">Delete</button>' : ''}
      </div>
    `;
    card.querySelector('.post-content').textContent = post.content;

    card.querySelector('.who-btn').addEventListener('click', () => openProfile(post.author.username));

    card.querySelector('.like-btn').addEventListener('click', async () => {
      try {
        const liked = !post.liked_by_me;
        const data = liked
          ? await api(`/posts/${post.id}/like`, { method: 'POST' })
          : await api(`/posts/${post.id}/like`, { method: 'DELETE' });
        post.liked_by_me = liked;
        post.likes_count = data.likes_count;
        const btn = card.querySelector('.like-btn');
        btn.classList.toggle('liked', liked);
        btn.innerHTML = `${liked ? '♥' : '♡'} <span class="like-count">${data.likes_count}</span>`;
      } catch (err) {
        showToast(err.message);
      }
    });

    card.querySelector('.comment-btn').addEventListener('click', () => openThread(post));

    const delBtn = card.querySelector('.post-delete');
    if (delBtn) {
      delBtn.addEventListener('click', async () => {
        if (!confirm('Delete this post?')) return;
        try {
          await api(`/posts/${post.id}`, { method: 'DELETE' });
          card.remove();
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    return card;
  }

  // ---------- profile ----------
  async function openProfile(username) {
    document.querySelectorAll('.nav-link').forEach((b) => b.classList.remove('active'));
    $('#nav-profile').classList.add('active');

    state.view = 'profile';
    state.viewedUsername = username;
    $('#view-title').textContent = `@${username}`;
    $('#profile-panel').hidden = false;

    const list = $('#post-list');
    list.innerHTML = '<p class="empty-state">Loading…</p>';

    try {
      const { user } = await api(`/users/${username}`);
      renderProfilePanel(user);

      const { posts } = await api(`/posts?user_id=${user.id}`);
      renderPosts(posts, list, { emptyMsg: 'No posts yet.' });
    } catch (err) {
      list.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  function renderProfilePanel(user) {
    $('#profile-avatar').textContent = initials(user.username);
    $('#profile-username').textContent = `@${user.username}`;
    $('#profile-bio').textContent = user.bio || 'No bio yet.';
    $('#profile-posts').textContent = user.posts_count;
    $('#profile-followers').textContent = user.followers_count;
    $('#profile-following').textContent = user.following_count;

    const followBtn = $('#profile-follow-btn');
    const bioEdit = $('#profile-bio-edit');
    const isSelf = state.user && user.username === state.user.username;

    if (isSelf) {
      followBtn.hidden = true;
      bioEdit.hidden = false;
      $('#bio-input').value = user.bio || '';
    } else {
      bioEdit.hidden = true;
      followBtn.hidden = false;
      followBtn.textContent = user.is_following ? 'Following' : 'Follow';
      followBtn.classList.toggle('btn-secondary', user.is_following);
      followBtn.onclick = async () => {
        try {
          if (user.is_following) {
            await api(`/users/${user.id}/follow`, { method: 'DELETE' });
            user.is_following = false;
            user.followers_count -= 1;
          } else {
            await api(`/users/${user.id}/follow`, { method: 'POST' });
            user.is_following = true;
            user.followers_count += 1;
          }
          renderProfilePanel(user);
        } catch (err) {
          showToast(err.message);
        }
      };
    }
  }

  $('#bio-save').addEventListener('click', async () => {
    try {
      const { user } = await api('/users/me/update', { method: 'PUT', body: { bio: $('#bio-input').value } });
      renderProfilePanel(user);
      showToast('Bio updated.');
    } catch (err) {
      showToast(err.message);
    }
  });

  // ---------- comment thread modal ----------
  const modal = $('#thread-modal');

  async function openThread(post) {
    state.activeThreadPostId = post.id;
    modal.hidden = false;

    $('#thread-post').innerHTML = '';
    const summary = document.createElement('div');
    summary.className = 'post-card';
    summary.innerHTML = `
      <div class="post-head">
        <div class="avatar">${initials(post.author.username)}</div>
        <div class="who"><strong>${post.author.username}</strong><span class="when">${timeAgo(post.created_at)}</span></div>
      </div>
      <p class="post-content"></p>
    `;
    summary.querySelector('.post-content').textContent = post.content;
    $('#thread-post').appendChild(summary);

    await loadComments(post.id);
  }

  async function loadComments(postId) {
    const wrap = $('#thread-comments');
    wrap.innerHTML = '<p class="empty-state">Loading…</p>';
    try {
      const { comments } = await api(`/posts/${postId}/comments`);
      wrap.innerHTML = '';
      if (!comments.length) {
        wrap.innerHTML = '<p class="empty-state">No replies yet.</p>';
        return;
      }
      comments.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'comment-row';
        row.innerHTML = `
          <div class="avatar" style="width:32px;height:32px;font-size:13px;">${initials(c.username)}</div>
          <div class="comment-body">
            <span class="cwho">${c.username}</span><span class="when">${timeAgo(c.created_at)}</span>
            <p class="comment-text" style="margin:4px 0 0;"></p>
          </div>
        `;
        row.querySelector('.comment-text').textContent = c.content;
        wrap.appendChild(row);
      });
    } catch (err) {
      wrap.innerHTML = `<p class="empty-state">${err.message}</p>`;
    }
  }

  $('#comment-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#comment-input');
    const content = input.value.trim();
    if (!content || !state.activeThreadPostId) return;
    try {
      await api(`/posts/${state.activeThreadPostId}/comments`, { method: 'POST', body: { content } });
      input.value = '';
      loadComments(state.activeThreadPostId);
    } catch (err) {
      showToast(err.message);
    }
  });

  function closeModal() {
    modal.hidden = true;
    state.activeThreadPostId = null;
  }
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-backdrop').addEventListener('click', closeModal);

  // ---------- bootstrap ----------
  async function enterApp() {
    authScreen.hidden = true;
    appEl.hidden = false;
    document.querySelectorAll('.nav-link').forEach((b) => b.classList.remove('active'));
    document.querySelector('.nav-link[data-view="feed"]').classList.add('active');
    state.view = 'feed';
    $('#view-title').textContent = 'Feed';
    $('#profile-panel').hidden = true;
    loadFeed();
  }

  async function init() {
    if (!state.token) return; // stay on auth screen
    try {
      const { user } = await api('/auth/me');
      state.user = user;
      enterApp();
    } catch (err) {
      setToken(null); // stale/expired token
    }
  }

  init();
})();

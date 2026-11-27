(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const TPFX = window.TPFX = window.TPFX || {};

  function getStorageTheme() {
    try { return localStorage.getItem('taskpilot-theme'); } catch (error) { return null; }
  }

  function setStorageTheme(value) {
    try { localStorage.setItem('taskpilot-theme', value); } catch (error) { /* Storage may be disabled. */ }
  }

  function themeIcon(button, light) {
    button.innerHTML = light
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3 6.6 6.6 0 0 0 21 12.8z"></path></svg>';
    button.setAttribute('aria-pressed', String(light));
  }

  function applyTheme() {
    const light = getStorageTheme() === 'light';
    document.body.classList.toggle('light-mode', light);
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(button => themeIcon(button, light));
  }

  applyTheme();

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action="toggle-theme"]');
    if (!button) return;
    const light = !document.body.classList.contains('light-mode');
    document.body.classList.toggle('light-mode', light);
    setStorageTheme(light ? 'light' : 'dark');
    document.querySelectorAll('[data-action="toggle-theme"]').forEach(item => themeIcon(item, light));
  });

  let revealObserver;
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
  }

  TPFX.reveal = function (root) {
    const container = root || document;
    const elements = [];
    if (container.matches && container.matches('.reveal')) elements.push(container);
    if (container.querySelectorAll) container.querySelectorAll('.reveal').forEach(element => elements.push(element));
    elements.forEach((element, index) => {
      if (!element.classList.contains('visible')) {
        element.style.setProperty('--reveal-delay', `${Math.min(index * 60, 360)}ms`);
        if (revealObserver && !reducedMotion) revealObserver.observe(element);
        else element.classList.add('visible');
      }
    });
  };

  TPFX.countUp = function (root) {
    const container = root || document;
    container.querySelectorAll('[data-count]:not([data-counted])').forEach(element => {
      element.dataset.counted = 'true';
      const target = Number(element.dataset.count);
      if (!Number.isFinite(target) || reducedMotion) {
        element.textContent = `${element.dataset.count}${element.dataset.suffix || ''}`;
        return;
      }
      const started = performance.now();
      const duration = 1500;
      const decimals = String(target).includes('.') ? 1 : 0;
      function frame(now) {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = `${(target * eased).toFixed(decimals)}${element.dataset.suffix || ''}`;
        if (progress < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  };

  const typingLines = [
    "Here's what's happening across your projects",
    'Stay ahead of your deadlines',
    'Ship the work that matters'
  ];

  TPFX.typing = function (element) {
    if (!element || element.dataset.typingReady) return;
    element.dataset.typingReady = 'true';
    element.classList.add('typing-line');
    if (reducedMotion) {
      element.textContent = typingLines[0];
      return;
    }
    let line = 0;
    let index = 0;
    let deleting = false;
    let timer = null;
    function tick() {
      if (!element.isConnected) return;
      if (document.hidden) { timer = null; return; }
      const value = typingLines[line];
      index += deleting ? -1 : 1;
      element.textContent = value.slice(0, index);
      let wait = deleting ? 35 : 60;
      if (!deleting && index === value.length) { deleting = true; wait = 1800; }
      if (deleting && index === 0) { deleting = false; line = (line + 1) % typingLines.length; wait = 300; }
      timer = window.setTimeout(tick, wait);
    }
    tick();
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && element.isConnected && !timer) tick();
    });
  };

  function initProgress() {
    const progress = document.getElementById('scrollProgress');
    if (!progress) return;
    let scheduled = false;
    const update = () => {
      scheduled = false;
      const scroller = document.querySelector('.main-content');
      const top = scroller ? scroller.scrollTop : window.scrollY;
      const height = scroller ? scroller.scrollHeight - scroller.clientHeight : document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = `${height > 0 ? Math.min(100, top / height * 100) : 0}%`;
    };
    const schedule = () => {
      if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', schedule, { passive: true });
    document.querySelector('.main-content')?.addEventListener('scroll', schedule, { passive: true });
    update();
  }

  function initAura() {
    const aura = document.getElementById('cursor-aura');
    if (!aura || reducedMotion || !finePointer) return;
    let targetX = -200;
    let targetY = -200;
    let x = targetX;
    let y = targetY;
    window.addEventListener('pointermove', event => { targetX = event.clientX; targetY = event.clientY; }, { passive: true });
    function frame() {
      x += (targetX - x) * 0.08;
      y += (targetY - y) * 0.08;
      aura.style.transform = `translate3d(${x - 75}px, ${y - 75}px, 0)`;
      requestAnimationFrame(frame);
    }
    frame();
  }

  function initTilt() {
    if (reducedMotion || !finePointer) return;
    document.addEventListener('pointermove', event => {
      if (document.body.classList.contains('is-dragging')) return;
      const card = event.target.closest('.project-card, .stat-card, .task-card');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const max = card.classList.contains('task-card') ? 3 : 4;
      card.style.setProperty('--tilt-x', `${(-y * max).toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${(x * max).toFixed(2)}deg`);
    }, { passive: true });
    document.addEventListener('pointerout', event => {
      const card = event.target.closest('.project-card, .stat-card, .task-card');
      if (card && !card.contains(event.relatedTarget)) {
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
      }
    });
  }

  function initParticles() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas || reducedMotion) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const particles = [];
    const pointer = { x: -1000, y: -1000 };
    const count = window.matchMedia('(max-width: 768px)').matches ? 20 : 40;
    let active = true;
    let visible = true;
    let last = 0;
    let canvasCleared = false;
    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = Math.max(1, rect.width);
      canvas.height = Math.max(1, rect.height);
    }
    resize();
    for (let i = 0; i < count; i += 1) particles.push({ x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.0003, vy: (Math.random() - 0.5) * 0.0003, r: 1 + Math.random() * 2, c: i % 2 ? 'rgba(232,121,249,.55)' : 'rgba(124,58,237,.55)' });
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', event => { pointer.x = event.clientX; pointer.y = event.clientY; }, { passive: true });
    document.addEventListener('visibilitychange', () => { active = !document.hidden; });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }, { threshold: 0.01 }).observe(canvas);
    function frame(time) {
      requestAnimationFrame(frame);
      const authVisible = document.getElementById('auth-screen')?.style.display !== 'none';
      const dashboardVisible = document.getElementById('page-dashboard')?.classList.contains('active');
      if (!active || !visible || (!authVisible && !dashboardVisible)) {
        if (!canvasCleared) { context.clearRect(0, 0, canvas.width, canvas.height); canvasCleared = true; }
        return;
      }
      canvasCleared = false;
      if (time - last < 16) return;
      last = time;
      context.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i += 1) {
        const particle = particles[i];
        particle.x += particle.vx;
        particle.y += particle.vy;
        if (particle.x < 0 || particle.x > 1) particle.vx *= -1;
        if (particle.y < 0 || particle.y > 1) particle.vy *= -1;
        const px = particle.x * canvas.width;
        const py = particle.y * canvas.height;
        const dx = px - pointer.x;
        const dy = py - pointer.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (finePointer && distance < 120) { particle.x += dx / Math.max(120, distance) * 0.0005; particle.y += dy / Math.max(120, distance) * 0.0005; }
        context.beginPath(); context.fillStyle = particle.c; context.arc(px, py, particle.r, 0, Math.PI * 2); context.fill();
        for (let j = i + 1; j < particles.length; j += 1) {
          const other = particles[j];
          const ox = other.x * canvas.width - px;
          const oy = other.y * canvas.height - py;
          const distanceSquared = ox * ox + oy * oy;
          if (distanceSquared < 19600) { context.strokeStyle = `rgba(168,85,247,${0.16 - distanceSquared / 19600 * 0.12})`; context.beginPath(); context.moveTo(px, py); context.lineTo(px + ox, py + oy); context.stroke(); }
        }
      }
    }
    requestAnimationFrame(frame);
  }

  function scan(root) {
    const container = root || document;
    const selector = '.stat-card, .project-card, .task-card, .panel, .notification-item';
    const elements = [];
    if (container.matches && container.matches(selector)) elements.push(container);
    container.querySelectorAll(selector).forEach(element => elements.push(element));
    elements.forEach((element, index) => {
      element.classList.add('reveal');
      element.style.setProperty('--reveal-delay', `${Math.min(index * 60, 360)}ms`);
    });
    TPFX.reveal(container);
    TPFX.countUp(container);
  }

  initProgress();
  initAura();
  initTilt();
  initParticles();
  scan(document);

  const appScreen = document.getElementById('app-screen');
  if (appScreen && 'MutationObserver' in window) {
    new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => { if (node.nodeType === 1) scan(node); }))).observe(appScreen, { childList: true, subtree: true });
  }
}());

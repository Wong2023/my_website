'use strict';

document.documentElement.classList.add('js');

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let motionEnabled = !reducedMotion.matches;
let motionPreference = null;
const activeMotion = new Set();
const detailAnimations = new Map();
let finishTyping = () => {};
let refreshAmbient = () => {};

function animateUI(element, frames, options = {}) {
  if (!motionEnabled || !element?.animate) return null;
  const animation = element.animate(frames, {
    duration: 480, easing: 'cubic-bezier(.16, 1, .3, 1)', ...options
  });
  activeMotion.add(animation);
  animation.finished.then(() => activeMotion.delete(animation), () => activeMotion.delete(animation));
  return animation;
}

// Navigation stays usable without JavaScript; only the enhancement collapses it.
const menuButton = document.querySelector('.menu-toggle');
const menu = document.querySelector('.nav-menu');
const mobileQuery = window.matchMedia('(max-width: 800px)');

function setMenu(open, returnFocus = false) {
  if (!menuButton || !menu) return;
  const isOpen = Boolean(open && mobileQuery.matches);
  menu.classList.toggle('is-open', isOpen);
  menuButton.setAttribute('aria-expanded', String(isOpen));
  menuButton.querySelector('.menu-label').textContent = isOpen ? 'Close' : 'Menu';
  menuButton.querySelector('.menu-symbol').textContent = isOpen ? '−' : '+';
  if (isOpen) {
    animateUI(menu, [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 260 });
    menu.querySelectorAll('li').forEach((item, index) => {
      animateUI(item, [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'none' }],
        { duration: 340, delay: 40 + index * 45, fill: 'backwards' });
    });
  }
  if (returnFocus && mobileQuery.matches) menuButton.focus();
}

// Native details remain the fallback. Enhanced height transitions are reversible.
const projectDetails = [...document.querySelectorAll('.project-details')];
const allDetailsButton = document.querySelector('.details-toggle');

function syncDetailsButton() {
  if (!allDetailsButton) return;
  const allOpen = projectDetails.every(detail => {
    const pending = detailAnimations.get(detail);
    return pending ? pending.targetOpen : detail.open;
  });
  allDetailsButton.setAttribute('aria-expanded', String(allOpen));
  allDetailsButton.replaceChildren(
    document.createTextNode(allOpen ? 'Collapse project details ' : 'Expand project details ')
  );
  const symbol = document.createElement('span');
  symbol.setAttribute('aria-hidden', 'true');
  symbol.textContent = allOpen ? '−' : '+';
  allDetailsButton.append(symbol);
}

function completeDetail(detail, open) {
  detail.open = open;
  detail.style.removeProperty('height');
  detail.style.removeProperty('overflow');
  detailAnimations.delete(detail);
  syncDetailsButton();
}

function setDetail(detail, open) {
  const currentHeight = detail.getBoundingClientRect().height;
  const previous = detailAnimations.get(detail);
  if (previous) previous.animation.cancel();
  detailAnimations.delete(detail);
  if (!motionEnabled || !detail.animate) {
    completeDetail(detail, open);
    return;
  }
  detail.style.removeProperty('height');
  detail.open = true;
  const expandedHeight = detail.getBoundingClientRect().height;
  const closedHeight = detail.querySelector('summary').getBoundingClientRect().height + 1;
  detail.style.height = `${currentHeight}px`;
  detail.style.overflow = 'hidden';
  const animation = animateUI(detail, [
    { height: `${currentHeight}px` },
    { height: `${open ? expandedHeight : closedHeight}px` }
  ], { duration: 340 });
  detailAnimations.set(detail, { animation, targetOpen: open });
  animation.onfinish = () => {
    if (detailAnimations.get(detail)?.animation === animation) completeDetail(detail, open);
  };
  syncDetailsButton();
}

projectDetails.forEach((detail, index) => {
  if (!detail.id) detail.id = `project-details-${index + 1}`;
  detail.querySelector('summary')?.addEventListener('click', event => {
    if (!motionEnabled) return;
    event.preventDefault();
    const pending = detailAnimations.get(detail);
    setDetail(detail, !(pending ? pending.targetOpen : detail.open));
  });
  detail.addEventListener('toggle', syncDetailsButton);
});

if (allDetailsButton) {
  allDetailsButton.hidden = false;
  allDetailsButton.setAttribute('aria-controls', projectDetails.map(detail => detail.id).join(' '));
  allDetailsButton.addEventListener('click', () => {
    const open = allDetailsButton.getAttribute('aria-expanded') !== 'true';
    projectDetails.forEach(detail => setDetail(detail, open));
  });
}

// Full text stays in the DOM; a separate visual layer types once without reflow.
function startTyping() {
  finishTyping();
  if (!motionEnabled) return;
  const lines = [...document.querySelectorAll('.typing-line')].map(line => ({
    element: line,
    output: line.querySelector('.type-output'),
    text: line.querySelector('.type-measure')?.textContent || ''
  }));
  if (!lines.length) return;
  let typingFrame = 0;
  const start = performance.now() + 100;
  const characterDuration = 26;
  finishTyping = () => {
    cancelAnimationFrame(typingFrame);
    lines.forEach(line => {
      line.output.textContent = line.text;
      delete line.element.dataset.typing;
    });
  };
  const tick = now => {
    let offset = 0;
    let done = true;
    lines.forEach(line => {
      const elapsed = now - start - offset;
      const count = Math.max(0, Math.min(line.text.length, Math.floor(elapsed / characterDuration)));
      if (line.output.textContent !== line.text.slice(0, count)) {
        line.output.textContent = line.text.slice(0, count);
      }
      line.element.dataset.typing = String(elapsed >= 0 && count < line.text.length);
      if (count < line.text.length) done = false;
      offset += line.text.length * characterDuration + 110;
    });
    if (done) finishTyping();
    else typingFrame = requestAnimationFrame(tick);
  };
  typingFrame = requestAnimationFrame(tick);
}

// Ambient particles: visible drift, gentle repulsion from the cursor on desktop.
const ambientCanvas = document.getElementById('ambientBackground');
if (ambientCanvas) {
  const context = ambientCanvas.getContext('2d');
  if (context) {
    let width = 0;
    let height = 0;
    let dots = [];
    let frame = 0;
    let lastPaint = 0;
    const pointer = { x: -999, y: -999 };
    const repelRadius = 140;

    const paint = (delta = 0) => {
      context.clearRect(0, 0, width, height);
      dots.forEach(dot => {
        dot.x += dot.vx * delta;
        dot.y += dot.vy * delta;

        const dx = dot.x - pointer.x;
        const dy = dot.y - pointer.y;
        const distance = Math.hypot(dx, dy);
        if (distance < repelRadius && distance > 0) {
          const force = (1 - distance / repelRadius) * 90 * delta;
          dot.x += (dx / distance) * force;
          dot.y += (dy / distance) * force;
        }

        if (dot.x < -3) dot.x = width + 3;
        if (dot.x > width + 3) dot.x = -3;
        if (dot.y < -3) dot.y = height + 3;
        context.beginPath();
        context.fillStyle = `rgba(145,229,188,${dot.alpha})`;
        context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
        context.fill();
      });
    };
    const tick = timestamp => {
      if (!motionEnabled || document.hidden) {
        frame = 0;
        ambientCanvas.dataset.running = 'false';
        return;
      }
      paint(Math.min((timestamp - lastPaint) / 1000, .05));
      lastPaint = timestamp;
      frame = requestAnimationFrame(tick);
    };
    refreshAmbient = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      const running = motionEnabled && !document.hidden;
      ambientCanvas.dataset.running = String(running);
      if (running) {
        lastPaint = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      ambientCanvas.width = Math.round(width * ratio);
      ambientCanvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(30, Math.min(70, Math.round(width * height / 22000)));
      dots = Array.from({ length: count }, () => ({
        x: Math.random() * width, y: Math.random() * height,
        vx: (Math.random() - .5) * 30, vy: -(15 + Math.random() * 25),
        radius: 1 + Math.random() * 1.4, alpha: .35 + Math.random() * .45
      }));
      ambientCanvas.dataset.particles = String(count);
      paint();
    };
    // Mobile browsers fire resize when the address bar hides; only rebuild on width changes.
    let lastWidth = window.innerWidth;
    resize();
    window.addEventListener('resize', () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      resize();
    }, { passive: true });
    window.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { pointer.x = pointer.y = -999; });
    document.addEventListener('visibilitychange', refreshAmbient);
    window.addEventListener('pagehide', () => cancelAnimationFrame(frame));
    window.addEventListener('pageshow', refreshAmbient);
  } else {
    ambientCanvas.hidden = true;
  }
}

const motionButton = document.querySelector('.motion-toggle');
function applyMotion() {
  motionEnabled = !reducedMotion.matches && (motionPreference ?? true);
  document.documentElement.dataset.motion = motionEnabled ? 'on' : 'off';
  if (motionButton) {
    motionButton.hidden = false;
    motionButton.disabled = reducedMotion.matches;
    motionButton.setAttribute('aria-pressed', String(motionEnabled));
    motionButton.querySelector('.motion-label').textContent = reducedMotion.matches
      ? 'Reduced motion' : motionEnabled ? 'Motion on' : 'Motion off';
    motionButton.title = reducedMotion.matches
      ? 'Reduced motion is enabled in your device settings'
      : motionEnabled ? 'Pause background and text animations' : 'Enable background and text animations';
  }
  if (!motionEnabled) {
    finishTyping();
    [...detailAnimations].forEach(([detail, state]) => {
      state.animation.cancel();
      completeDetail(detail, state.targetOpen);
    });
    [...activeMotion].forEach(animation => {
      try { animation.finish(); } catch { animation.cancel(); }
    });
  }
  refreshAmbient();
}

motionButton?.addEventListener('click', () => {
  motionPreference = !motionEnabled;
  applyMotion();
  if (motionEnabled) startTyping();
});
reducedMotion.addEventListener('change', applyMotion);
applyMotion();
startTyping();

// Hero entrance: fade with a short upward slide, staggered.
if (motionEnabled) {
  document.querySelectorAll('.hero-content > *, .portrait, .highlights').forEach((element, index) => {
    animateUI(element,
      [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
      { duration: 700, delay: index * 70, fill: 'backwards' });
  });
}

// Scroll reveals: fade + slide up, with a cascade inside grids and lists.
if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const target = entry.target;
      revealObserver.unobserve(target);
      const siblings = [...target.parentElement.children].filter(child => child.matches('.project-card, .certificate-card, .experience-row'));
      const index = Math.max(0, siblings.indexOf(target));
      animateUI(target,
        [{ opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'none' }],
        { duration: 760, delay: Math.min(index, 3) * 90, fill: 'backwards' });
    });
  }, { threshold: 0, rootMargin: '0px 0px 6% 0px' });
  document.querySelectorAll('.section-heading, .thesis, .project-card, .experience-row, .about-copy, .toolkit, .certificate-card, .contact-layout')
    .forEach(element => revealObserver.observe(element));
}
document.addEventListener('focusin', event => {
  const region = event.target.closest('.project-card, .thesis, .certificate-card, .contact-layout, .nav-menu');
  if (!region) return;
  region.getAnimations().forEach(animation => animation.finish());
});

// Count-up for the hero highlights when they scroll into view.
const countTargets = [...document.querySelectorAll('.highlights dt')];
if (countTargets.length && 'IntersectionObserver' in window) {
  const countObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const element = entry.target;
      countObserver.unobserve(element);
      if (!motionEnabled) return;
      const match = element.textContent.trim().match(/^(\d+)(.*)$/);
      if (!match) return;
      const final = element.textContent;
      const target = Number(match[1]);
      const suffix = match[2];
      const duration = 1300;
      const begin = performance.now() + 250;
      element.textContent = `0${suffix}`;
      const step = now => {
        if (!motionEnabled) { element.textContent = final; return; }
        const progress = Math.min(Math.max((now - begin) / duration, 0), 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = `${Math.round(target * eased)}${suffix}`;
        if (progress < 1) requestAnimationFrame(step);
        else element.textContent = final;
      };
      requestAnimationFrame(step);
    });
  }, { threshold: .4 });
  countTargets.forEach(element => countObserver.observe(element));
}

// Ripple on buttons and cards, from the exact press point.
document.querySelectorAll('.btn, .certificate-card, .nav-contact, .mobile-contact, .menu-toggle, .modal-close').forEach(element => {
  element.addEventListener('pointerdown', event => {
    if (!motionEnabled || event.button > 0) return;
    const bounds = element.getBoundingClientRect();
    const size = Math.max(bounds.width, bounds.height) * 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.setAttribute('aria-hidden', 'true');
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - bounds.left - size / 2}px`;
    ripple.style.top = `${event.clientY - bounds.top - size / 2}px`;
    element.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });
});

// Small reading-position cue for the long page, plus the floating back-to-top button.
const progressBar = document.querySelector('.reading-progress span');
const toTop = document.querySelector('.to-top');
let progressFrame = 0;
let toTopVisible = false;

if (toTop) {
  toTop.hidden = false;
  toTop.addEventListener('click', event => {
    event.preventDefault();
    window.scrollTo({ top: 0, behavior: motionEnabled ? 'smooth' : 'auto' });
    document.getElementById('home')?.focus?.({ preventScroll: true });
  });
}

function updateProgress() {
  const distance = document.documentElement.scrollHeight - window.innerHeight;
  if (progressBar) progressBar.style.transform = `scaleX(${distance > 0 ? window.scrollY / distance : 0})`;
  if (toTop) {
    const show = window.scrollY > 600;
    if (show !== toTopVisible) {
      toTopVisible = show;
      toTop.classList.toggle('is-visible', show);
    }
  }
  progressFrame = 0;
}
window.addEventListener('scroll', () => {
  if (!progressFrame) progressFrame = requestAnimationFrame(updateProgress);
}, { passive: true });
window.addEventListener('resize', updateProgress, { passive: true });
updateProgress();

if (menuButton && menu) {
  menuButton.hidden = false;
  menuButton.addEventListener('click', () => {
    setMenu(menuButton.getAttribute('aria-expanded') !== 'true');
  });
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => setMenu(false));
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.navbar')) setMenu(false);
  });
  mobileQuery.addEventListener('change', () => setMenu(false));
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menuButton?.getAttribute('aria-expanded') === 'true') {
    setMenu(false, true);
  }
});

// Current section marker. All content is visible if IntersectionObserver is absent.
if ('IntersectionObserver' in window) {
  const navLinks = [...document.querySelectorAll('.nav-link')];
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => {
        if (link.getAttribute('href') === `#${entry.target.id}`) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    });
  }, { rootMargin: '-15% 0px -55% 0px', threshold: 0 });
  document.querySelectorAll('main section[id]').forEach(section => sectionObserver.observe(section));
}

// Certificates: deliberate click/Enter activation, native focus trap and Escape.
const certificateModal = document.getElementById('certificateModal');
const modalImage = document.getElementById('modalImage');
const modalCaption = document.getElementById('modalCaption');
let certificateTrigger = null;
let bodyWasLocked = false;

if (certificateModal && modalImage && modalCaption) {
  document.querySelectorAll('.certificate-card[data-image]').forEach(button => {
    button.addEventListener('click', () => {
      if (certificateModal.open) return;
      certificateTrigger = button;
      modalImage.src = button.dataset.image;
      modalImage.alt = button.dataset.caption || 'Certificate';
      modalCaption.textContent = button.dataset.caption || 'Certificate';
      if (typeof certificateModal.showModal === 'function') {
        bodyWasLocked = document.body.classList.contains('modal-open');
        certificateModal.showModal();
        document.body.classList.add('modal-open');
      } else {
        // Older browsers can still open the original file, with no scroll lock.
        window.open(button.dataset.image, '_blank', 'noopener,noreferrer');
      }
    });
  });

  certificateModal.addEventListener('click', event => {
    if (event.target !== certificateModal) return;
    const bounds = certificateModal.getBoundingClientRect();
    const outside = event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom;
    if (outside) certificateModal.close();
  });

  certificateModal.addEventListener('close', () => {
    if (!bodyWasLocked) document.body.classList.remove('modal-open');
    if (certificateTrigger?.isConnected) certificateTrigger.focus({ preventScroll: true });
    certificateTrigger = null;
  });
}

// Email remains visible and selectable if clipboard permission is unavailable.
const copyEmail = document.querySelector('.copy-email');
const copyFeedback = document.querySelector('.copy-feedback');
const emailLink = document.querySelector('.email-address');

if (copyEmail && copyFeedback && emailLink) {
  copyEmail.hidden = false;
  copyEmail.addEventListener('click', async () => {
    const email = emailLink.getAttribute('href').replace(/^mailto:/, '');
    copyEmail.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(email);
      copyFeedback.textContent = 'Email address copied.';
      animateUI(copyFeedback,
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 320, fill: 'backwards' });
    } catch {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(emailLink.firstChild || emailLink);
      selection?.removeAllRanges();
      selection?.addRange(range);
      copyFeedback.textContent = 'Select the address above and copy it manually.';
    } finally {
      copyEmail.disabled = false;
    }
  });
}

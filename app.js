const random = (min, max) => min + Math.random() * (max - min);
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const controllers = [];
let mouse = null;
let suspended = document.hidden;
let groupTimer = null;
let groupRunning = false;
let cohortDeadline = 0;

// Nearby clicks share a waiting period, then a random subset acts together.
function nextDeadline(joinGroup = false) {
  const now = performance.now();
  if (joinGroup && cohortDeadline >= now + 2500) return cohortDeadline;
  const deadline = now + random(2500, 6500);
  if (joinGroup) cohortDeadline = deadline;
  return deadline;
}

function scheduleGroup() {
  clearTimeout(groupTimer);
  groupTimer = null;
  if (groupRunning || suspended || document.hidden) return;
  const ready = controllers.filter(item => item.ready());
  if (!ready.length) return;
  const deadline = Math.min(...ready.map(item => item.deadline));
  groupTimer = setTimeout(runGroup, Math.max(0, deadline - performance.now()));
}

async function runGroup() {
  groupTimer = null;
  if (groupRunning || suspended || document.hidden) return;
  const ready = controllers.filter(item => item.ready() && item.deadline <= performance.now() + 20);
  if (!ready.length) { scheduleGroup(); return; }
  groupRunning = true;
  for (let i = ready.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ready[i], ready[j]] = [ready[j], ready[i]];
  }
  const count = 1 + Math.floor(Math.random() * ready.length);
  const batch = ready.slice(0, count);
  // Unselected switches wait for another quiet moment instead of following at once.
  const later = nextDeadline();
  ready.slice(count).forEach(item => { item.deadline = later; });
  try {
    await Promise.all(batch.map(item => item.sneak()));
  } finally {
    groupRunning = false;
    scheduleGroup();
  }
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

const smooth = t => t * t * (3 - 2 * t);
const easeOut = t => 1 - (1 - t) ** 3;

function animate(from, to, duration, draw, signal, easing = smooth) {
  signal.throwIfAborted();
  if (reducedMotion.matches) { draw(to); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    let frame;
    const started = performance.now();
    const abort = () => { cancelAnimationFrame(frame); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once: true });
    const tick = now => {
      const t = Math.min(1, (now - started) / duration);
      const progress = easing(t);
      const value = {};
      for (const key of Object.keys(from)) value[key] = from[key] + (to[key] - from[key]) * progress;
      draw(value);
      if (t < 1) frame = requestAnimationFrame(tick);
      else { signal.removeEventListener('abort', abort); resolve(); }
    };
    frame = requestAnimationFrame(tick);
  });
}

class ShyLamput {
  constructor(card) {
    this.stage = card.querySelector('.stage');
    this.toggle = card.querySelector('.toggle');
    this.head = card.querySelector('.character');
    this.hand = card.querySelector('[data-part="hand"]');
    this.finger = card.querySelector('[data-part="finger"]');
    this.arm = card.querySelector('[data-part="bodyMain"]');
    this.offLabel = card.querySelector('[data-part="offLabel"]');
    this.onLabel = card.querySelector('[data-part="onLabel"]');
    this.on = false;
    this.near = false;
    this.run = null;
    this.teased = false;
    this.deadline = Infinity;
    this.resetVisual();
    this.toggle.addEventListener('click', () => {
      this.cancel();
      this.setOn(!this.on);
      this.teased = false;
      this.deadline = this.on ? nextDeadline(true) : Infinity;
      scheduleGroup();
    });
  }

  ready() { return this.on && !this.near && !this.run; }

  setOn(on) {
    this.on = on;
    this.toggle.setAttribute('aria-checked', String(on));
    this.offLabel.classList.toggle('active', !on);
    this.onLabel.classList.toggle('active', on);
  }

  drawHead = ({ y, x = 0, tilt = 0 }) => {
    this.head.style.transform = `translate(${x}px, ${y}px) rotate(${tilt}deg)`;
  };

  drawHand = ({ x, y, extension }) => {
    for (const element of [this.hand, this.finger]) {
      element.style.transform = `translate(${x}px, ${y}px) scale(.44)`;
      element.style.opacity = String(extension);
    }
    // Derive the arm endpoint from the same wrist coordinates as the hand.
    const wristX = x + 170 * .44;
    const wristY = y + 53 * .44;
    this.arm.setAttribute('d', `M 276 168 C ${Math.max(306, wristX + 12)} 168, ${wristX + 20} ${wristY}, ${wristX - 1} ${wristY}`);
    this.arm.style.opacity = String(extension);
  };

  resetVisual() {
    this.stage.dataset.phase = 'hidden';
    this.stage.classList.remove('reaching', 'touching', 'peeking');
    this.drawHead({ y: 65 });
    this.drawHand({ x: 216, y: 140, extension: 0 });
  }

  cancel() {
    this.run?.abort();
    this.resetVisual();
  }

  updateProximity() {
    const rect = this.toggle.getBoundingClientRect();
    const dx = mouse ? Math.max(rect.left - mouse.x, 0, mouse.x - rect.right) : Infinity;
    const dy = mouse ? Math.max(rect.top - mouse.y, 0, mouse.y - rect.bottom) : Infinity;
    const near = Math.hypot(dx, dy) <= 10;
    if (near === this.near) return;
    this.near = near;
    this.stage.classList.toggle('pointer-near', near);
    if (near) this.cancel();
    else if (this.on) this.deadline = nextDeadline(true);
    scheduleGroup();
  }

  async sneak() {
    if (!this.ready() || suspended || document.hidden) return;
    const run = new AbortController();
    this.run = run;
    const { signal } = run;
    const isFeint = !this.teased && Math.random() < .70;
    const tucked = { y: 65, x: 0, tilt: 0 };
    const peek = { y: isFeint ? 6 : 0, x: random(-3, 3), tilt: random(-3, 2) };
    const hidden = { x: 216, y: 140, extension: 0 };
    const outside = { x: 284, y: 110, extension: 1 };
    const contact = { x: 270, y: 110, extension: 1 };
    const pressed = { x: 140, y: 110, extension: 1 };
    try {
      // A small stagger keeps a group from looking like identical looping animations.
      await wait(random(0, 180), signal);
      this.stage.dataset.phase = 'peeking';
      this.stage.classList.add('peeking');
      await animate(tucked, peek, random(620, 950), this.drawHead, signal);
      await wait(reducedMotion.matches ? 80 : random(140, 320), signal);
      if (isFeint) {
        this.teased = true;
        this.stage.dataset.phase = 'retreating';
        await animate(peek, tucked, 130, this.drawHead, signal, easeOut);
        return;
      }

      this.stage.dataset.phase = 'reaching';
      this.stage.classList.add('reaching');
      await animate(hidden, outside, random(160, 210), this.drawHand, signal, easeOut);
      this.stage.classList.add('touching');
      await animate(outside, contact, 65, this.drawHand, signal);
      signal.throwIfAborted();
      this.stage.dataset.phase = 'pressing';
      this.setOn(false);
      await animate(contact, pressed, 150, this.drawHand, signal);
      this.stage.classList.remove('touching');
      this.stage.dataset.phase = 'retreating';
      await Promise.all([
        animate(pressed, hidden, 130, this.drawHand, signal, easeOut),
        animate(peek, tucked, 110, this.drawHead, signal, easeOut)
      ]);
    } catch (error) {
      if (!signal.aborted) console.error('Lamput animation failed', error);
    } finally {
      if (this.run === run) {
        this.run = null;
        this.resetVisual();
        if (this.on && this.deadline <= performance.now()) this.deadline = nextDeadline();
      }
    }
  }
}

document.querySelectorAll('.switch-card').forEach(card => controllers.push(new ShyLamput(card)));

function refreshProximity() { controllers.forEach(item => item.updateProximity()); }
function trackPointer(event) {
  mouse = event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY };
  refreshProximity();
}
document.addEventListener('pointermove', trackPointer, { passive: true });
document.addEventListener('pointerdown', trackPointer, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { mouse = null; refreshProximity(); });
window.addEventListener('resize', refreshProximity);
window.addEventListener('scroll', refreshProximity, { passive: true, capture: true });

function suspend(value) {
  if (suspended === value) return;
  suspended = value;
  cohortDeadline = 0;
  controllers.forEach(item => {
    item.cancel();
    if (item.on) item.deadline = nextDeadline();
  });
  refreshProximity();
  scheduleGroup();
}
document.addEventListener('visibilitychange', () => suspend(document.hidden));
window.addEventListener('blur', () => suspend(true));
window.addEventListener('focus', () => { if (!document.hidden) suspend(false); });

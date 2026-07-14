// RumorMouth — minimal front-end script.
// Only job right now: fill in the live-feeling date/time stamps.
// No frameworks, no build step — keep this file boring on purpose.

document.addEventListener('DOMContentLoaded', () => {
  const dateEl = document.getElementById('masthead-date');
  const timeEl = document.getElementById('hero-time');
  const yearEl = document.getElementById('year');

  const now = new Date();

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }

  if (timeEl) {
    timeEl.textContent = now.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit'
    });
  }

  if (yearEl) {
    yearEl.textContent = now.getFullYear();
  }
});

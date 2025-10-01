async function loadTheme() {
  try {
    const res = await fetch('/api/theme');
    const { theme } = await res.json();
    document.body.setAttribute('data-theme', theme);
  } catch (err) {
    console.error('Failed to load theme:', err);
  }
}

async function setTheme(theme) {
  try {
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme })
    });
    document.body.setAttribute('data-theme', theme);
  } catch (err) {
    console.error('Failed to set theme:', err);
  }
}

// auto-load theme on page load
document.addEventListener('DOMContentLoaded', loadTheme);

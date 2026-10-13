// The first-run choice. The preload exposes only `sculptured.choose(mode, origin)` and the default address.
const $ = (id) => document.getElementById(id);
$('account').value = window.sculptured.defaultOrigin || '';
$('local-account').value = window.sculptured.defaultOrigin || '';
const show = (message) => { $('error').textContent = message || ''; };
$('local').addEventListener('click', async () => show(await window.sculptured.choose('local', $('local-account').value.trim() || null)));
$('use-account').addEventListener('click', async () => show(await window.sculptured.choose('account', $('account').value.trim())));

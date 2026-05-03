






document.addEventListener('DOMContentLoaded', () => {

    // ── API ─────────────────────────────────────────────────────────────────
    // Relative paths work on both localhost and Render (same server serves
    // the frontend AND handles /api/download and /api/proxy_download).
    const API_URL = '/api/download';
    const PROXY_URL = '/api/proxy_download';
    const API_KEY = '';   // set only if you enabled API_KEY on the backend

    // ── Theme ────────────────────────────────────────────────────────────────
    const html        = document.documentElement;
    const themeToggle = document.getElementById('theme-toggle');

    html.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');

    themeToggle?.addEventListener('click', () => {
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });

    // ── Mobile nav ───────────────────────────────────────────────────────────
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu   = document.getElementById('nav-menu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            const expanded = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', String(!expanded));
            navMenu.classList.toggle('active');
            document.body.style.overflow = expanded ? '' : 'hidden';
        });

        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                navMenu.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            });
        });

        document.addEventListener('click', (e) => {
            if (!navToggle.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                navToggle.setAttribute('aria-expanded', 'false');
                document.body.style.overflow = '';
            }
        });
    }

    // ── Download form (homepage only) ────────────────────────────────────────
    const form = document.getElementById('download-form');
    if (form) {
        const isValidTweetUrl = (url) =>
            /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/\d+(\?.*)?$/.test(url);

        const urlInput        = document.getElementById('tweet-url');
        const errorMsg        = document.getElementById('error-msg');
        const submitBtn       = document.getElementById('submit-btn');
        const spinner         = submitBtn.querySelector('.spinner');
        const btnText         = submitBtn.querySelector('.btn-text');
        const resultsSection  = document.getElementById('results-section');
        const thumbnailImg    = document.getElementById('thumbnail-img');
        const qualityDropdown = document.getElementById('quality-dropdown');
        const downloadBtn     = document.getElementById('download-btn');
        const copyLinkBtn     = document.getElementById('copy-link-btn');

        let currentMediaData = null;

        copyLinkBtn?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(urlInput.value);
                copyLinkBtn.textContent = 'Copied!';
                setTimeout(() => { copyLinkBtn.textContent = 'Copy Link'; }, 2000);
            } catch {
                alert('Could not copy — please copy the URL manually.');
            }
        });

        // When the user changes quality, rebuild the proxy download link
        qualityDropdown?.addEventListener('change', (e) => {
            const selected = currentMediaData?.media?.find(m => m.quality === e.target.value);
            if (selected) {
                const proxyLink = `${PROXY_URL}?video_url=${encodeURIComponent(selected.url)}&filename=${encodeURIComponent('twitter_video.mp4')}`;
                downloadBtn.href = proxyLink;
            }
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const url = urlInput.value.trim();

            if (!isValidTweetUrl(url)) {
                errorMsg.textContent = 'Please enter a valid X / Twitter post URL (e.g., https://x.com/user/status/123456)';
                return;
            }

            errorMsg.textContent = '';
            submitBtn.disabled = true;
            spinner.classList.remove('hidden');
            btnText.classList.add('hidden');
            resultsSection.classList.add('hidden');

            // Remove any previously rendered extra cards
            document.querySelectorAll('.extra-media-card').forEach(el => el.remove());

            try {
                const headers = { 'Content-Type': 'application/json' };
                if (API_KEY) headers['X-API-Key'] = API_KEY;

                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ url }),
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to fetch media');

                currentMediaData = data;
                renderResults(data);
            } catch (err) {
                errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
            } finally {
                submitBtn.disabled = false;
                spinner.classList.add('hidden');
                btnText.classList.remove('hidden');
            }
        });

        function renderResults(data) {
            resultsSection.classList.remove('hidden');

            if (!data.media || data.media.length === 0) {
                errorMsg.textContent = 'No downloadable media found in this tweet.';
                return;
            }

            const sortedMedia = [...data.media].sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

            thumbnailImg.src = data.thumbnail || 'https://placehold.co/480x270?text=No+Preview';

            qualityDropdown.innerHTML = '';
            sortedMedia.forEach((m) => {
                const option = document.createElement('option');
                option.value = m.quality;
                option.textContent = `${m.quality}${m.quality.includes('p') ? '' : 'p'} — ${m.type.toUpperCase()}`;
                qualityDropdown.appendChild(option);
            });

            // Set the download button to the proxy link for the highest quality
            if (sortedMedia.length > 0) {
                const proxyLink = `${PROXY_URL}?video_url=${encodeURIComponent(sortedMedia[0].url)}&filename=${encodeURIComponent('twitter_video.mp4')}`;
                downloadBtn.href = proxyLink;
            }

            if (sortedMedia.length > 1) {
                const listCard = document.createElement('div');
                listCard.className = 'card extra-media-card';
                listCard.innerHTML = '<h3>All Available Qualities</h3>';
                const ul = document.createElement('ul');
                ul.className = 'media-list';
                sortedMedia.forEach(m => {
                    const li = document.createElement('li');
                    const proxyLink = `${PROXY_URL}?video_url=${encodeURIComponent(m.url)}&filename=${encodeURIComponent('twitter_video.mp4')}`;
                    li.innerHTML = `<a href="${proxyLink}" download>${m.quality}${m.quality.includes('p') ? '' : 'p'} — ${m.type}</a>`;
                    ul.appendChild(li);
                });
                listCard.appendChild(ul);
                resultsSection.appendChild(listCard);
            }
        }
    }

    // ── Contact form (Formspree AJAX) ────────────────────────────────────────
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        const statusBox    = document.getElementById('form-status');
        const submitBtn    = document.getElementById('contact-submit');

        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending…';
            statusBox.classList.add('hidden');
            statusBox.className = 'form-status hidden';

            try {
                const response = await fetch(contactForm.action, {
                    method: 'POST',
                    body: new FormData(contactForm),
                    headers: { 'Accept': 'application/json' },
                });

                if (response.ok) {
                    statusBox.textContent = '✓ Message sent! We\'ll reply within 24 hours.';
                    statusBox.classList.remove('hidden');
                    statusBox.classList.add('success');
                    contactForm.reset();
                } else {
                    const data = await response.json();
                    throw new Error(data.error || 'Submission failed');
                }
            } catch (err) {
                statusBox.textContent = '✗ ' + (err.message || 'Something went wrong. Please email us directly.');
                statusBox.classList.remove('hidden');
                statusBox.classList.add('error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Message';
            }
        });
    }
});
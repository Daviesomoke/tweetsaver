







document.addEventListener('DOMContentLoaded', () => {

    // ── API ─────────────────────────────────────────────────────────────────
    // Use the subdomain if available, otherwise fallback to direct Render URL.
    const API_URL = 'https://api.x-downloadit.com/api/download';
    const PROXY_URL = 'https://api.x-downloadit.com/api/proxy_download';
    const FALLBACK_API_URL = 'https://tweetsaver-api.onrender.com/api/download';
    const FALLBACK_PROXY_URL = 'https://tweetsaver-api.onrender.com/api/proxy_download';

    const API_KEY = '';   // set only if you enabled API_KEY on the backend

    // ── Theme ────────────────────────────────────────────────────────────────
    const html        = document.documentElement;
    const themeToggle = document.getElementById('theme-toggle');

    html.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });
    }

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

    // ── Tiny helper – get the tweet ID from a URL ───────────────────────────
    const getTweetId = (url) => {
        const match = url.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
    };

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

        let currentMediaData = null;

        const makeProxyLink = (videoUrl, tweetId, useFallback = false) => {
            const baseName = tweetId ? `tweet_${tweetId}` : 'video';
            const proxy = useFallback ? FALLBACK_PROXY_URL : PROXY_URL;
            return `${proxy}?video_url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(baseName + '.mp4')}`;
        };

        const getApiUrl = (useFallback) => useFallback ? FALLBACK_API_URL : API_URL;

        qualityDropdown?.addEventListener('change', (e) => {
            const selected = currentMediaData?.media?.find(m => m.quality === e.target.value);
            if (selected) {
                const tweetId = getTweetId(urlInput.value.trim());
                // We don't know if fallback is needed here, just use current setting
                downloadBtn.href = makeProxyLink(selected.url, tweetId, currentMediaData?.useFallback);
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

            document.querySelectorAll('.extra-media-card').forEach(el => el.remove());

            // Try the subdomain first, if it fails, use fallback
            let apiUrl = API_URL;
            let useFallback = false;

            const fetchMedia = async (urlToUse) => {
                const headers = { 'Content-Type': 'application/json' };
                if (API_KEY) headers['X-API-Key'] = API_KEY;
                const response = await fetch(urlToUse, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ url }),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to fetch media');
                return data;
            };

            try {
                let data;
                try {
                    data = await fetchMedia(apiUrl);
                } catch (firstError) {
                    // If first attempt fails (e.g., subdomain not ready), try fallback
                    console.warn('Primary API failed, trying fallback...');
                    apiUrl = FALLBACK_API_URL;
                    useFallback = true;
                    data = await fetchMedia(apiUrl);
                }

                currentMediaData = data;
                currentMediaData.useFallback = useFallback;   // remember for later
                renderResults(data, url, useFallback);
            } catch (err) {
                errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
            } finally {
                submitBtn.disabled = false;
                spinner.classList.add('hidden');
                btnText.classList.remove('hidden');
            }
        });

        function renderResults(data, originalUrl, useFallback) {
            resultsSection.classList.remove('hidden');

            if (!data.media || data.media.length === 0) {
                errorMsg.textContent = 'No downloadable media found in this tweet.';
                return;
            }

            const tweetId = getTweetId(originalUrl);

            const sortedMedia = [...data.media].sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

            const count = sortedMedia.length;
            let displayMedia = [];
            if (count <= 3) {
                displayMedia = sortedMedia;
            } else {
                const middleIndex = Math.floor((count - 1) / 2);
                displayMedia = [sortedMedia[0], sortedMedia[middleIndex], sortedMedia[count - 1]];
            }

            thumbnailImg.src = data.thumbnail || 'https://placehold.co/480x270?text=No+Preview';

            qualityDropdown.innerHTML = '';
            displayMedia.forEach((m) => {
                const option = document.createElement('option');
                option.value = m.quality;
                option.textContent = `${m.quality}${m.quality.includes('p') ? '' : 'p'} — ${m.type.toUpperCase()}`;
                qualityDropdown.appendChild(option);
            });

            if (displayMedia.length > 0) {
                downloadBtn.href = makeProxyLink(displayMedia[0].url, tweetId, useFallback);
            }

            if (displayMedia.length > 1) {
                const listCard = document.createElement('div');
                listCard.className = 'card extra-media-card';
                listCard.innerHTML = '<h3>All Available Qualities</h3>';
                const ul = document.createElement('ul');
                ul.className = 'media-list';
                displayMedia.forEach(m => {
                    const li = document.createElement('li');
                    li.innerHTML = `<a href="${makeProxyLink(m.url, tweetId, useFallback)}" download>${m.quality}${m.quality.includes('p') ? '' : 'p'} — ${m.type}</a>`;
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
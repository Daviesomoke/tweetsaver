








/* ─────────────────────────────────────────────────────────────────────
   X-Downloadit · script.js
   Queue-aware downloader: paste & fetch ▸ pick quality ▸ download.
   While a download is in progress a "next" bar appears so the user
   can queue the next link without waiting.
   ───────────────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

    // ── Config ────────────────────────────────────────────────────────
    const API_URL          = 'https://api.x-downloadit.com/api/download';
    const PROXY_URL        = 'https://api.x-downloadit.com/api/proxy_download';
    const FALLBACK_API_URL = 'https://tweetsaver-api.onrender.com/api/download';
    const FALLBACK_PROXY_URL = 'https://tweetsaver-api.onrender.com/api/proxy_download';
    const API_KEY          = '';

    // ── Helpers ───────────────────────────────────────────────────────
    const isValidTweetUrl = (url) =>
        /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/\d+(\?.*)?$/.test(url);

    const cleanUrl = (raw) => {
        try {
            const p = new URL(raw.trim());
            return `https://${p.hostname}${p.pathname}`;
        } catch { return raw.trim(); }
    };

    const getTweetId = (url) => {
        const m = url.match(/\/status\/(\d+)/);
        return m ? m[1] : null;
    };

    const makeProxyLink = (quality, tweetUrl, tweetId, useFallback = false) => {
        const base = tweetId ? `tweet_${tweetId}` : 'video';
        const proxy = useFallback ? FALLBACK_PROXY_URL : PROXY_URL;
        return `${proxy}?tweet_url=${encodeURIComponent(tweetUrl)}&quality=${encodeURIComponent(quality)}&filename=${encodeURIComponent(base + '.mp4')}`;
    };

    // Filter out audio-only tracks
    const isVideoTrack = (m) => m.type === 'video' || m.type === 'image';

    // ── Theme ─────────────────────────────────────────────────────────
    const html = document.documentElement;
    const themeBtn = document.getElementById('theme-toggle');
    html.setAttribute('data-theme', localStorage.getItem('theme') || 'dark');
    themeBtn?.addEventListener('click', () => {
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });

    // ── Mobile nav ────────────────────────────────────────────────────
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu   = document.getElementById('nav-menu');
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            const open = navToggle.getAttribute('aria-expanded') === 'true';
            navToggle.setAttribute('aria-expanded', String(!open));
            navMenu.classList.toggle('active', !open);
            document.body.style.overflow = open ? '' : 'hidden';
        });
        navMenu.querySelectorAll('a').forEach(a => {
            a.addEventListener('click', () => {
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

    // ── Contact form (Formspree AJAX) ─────────────────────────────────
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        const statusBox = document.getElementById('form-status');
        const sendBtn   = document.getElementById('contact-submit');
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            sendBtn.disabled = true;
            sendBtn.textContent = 'Sending…';
            statusBox.className = 'form-status hidden';
            try {
                const res = await fetch(contactForm.action, {
                    method: 'POST',
                    body: new FormData(contactForm),
                    headers: { 'Accept': 'application/json' },
                });
                if (res.ok) {
                    statusBox.textContent = '✓ Message sent! We\'ll reply within 24 hours.';
                    statusBox.className = 'form-status success';
                    contactForm.reset();
                } else {
                    const d = await res.json();
                    throw new Error(d.error || 'Submission failed');
                }
            } catch (err) {
                statusBox.textContent = '✗ ' + (err.message || 'Something went wrong. Please email us directly.');
                statusBox.className = 'form-status error';
            } finally {
                sendBtn.disabled = false;
                sendBtn.textContent = 'Send Message';
            }
        });
        return; // contact page — stop here
    }

    // ── Download page only ────────────────────────────────────────────
    const mainPanel   = document.getElementById('main-panel');
    if (!mainPanel) return;

    const urlInput    = document.getElementById('tweet-url');
    const submitBtn   = document.getElementById('submit-btn');
    const spinner     = submitBtn.querySelector('.spinner');
    const btnText     = submitBtn.querySelector('.btn-text');
    const errorMsg    = document.getElementById('error-msg');
    const resultsArea = document.getElementById('results-area');
    const nextBar     = document.getElementById('next-bar');
    const nextInput   = document.getElementById('next-url');
    const nextBtn     = document.getElementById('next-btn');
    const queueSection = document.getElementById('queue-section');
    const queueList    = document.getElementById('queue-list');
    const queueCount   = document.getElementById('queue-count');

    // ── State ─────────────────────────────────────────────────────────
    let activeDownload = false; // true while a file download is in progress
    const downloadQueue = [];   // { url, id } pending items

    // ── API fetch ─────────────────────────────────────────────────────
    async function fetchMedia(tweetUrl) {
        const headers = { 'Content-Type': 'application/json' };
        if (API_KEY) headers['X-API-Key'] = API_KEY;

        const tryFetch = async (apiUrl) => {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({ url: tweetUrl }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to fetch media');
            return { data, useFallback: apiUrl === FALLBACK_API_URL };
        };

        try {
            return await tryFetch(API_URL);
        } catch {
            return await tryFetch(FALLBACK_API_URL);
        }
    }

    // ── Submit handler ────────────────────────────────────────────────
    async function handleFetch(rawUrl) {
        const url = cleanUrl(rawUrl);
        errorMsg.textContent = '';

        if (!isValidTweetUrl(url)) {
            errorMsg.textContent = 'Please enter a valid X / Twitter post URL.';
            return;
        }

        // Loading state
        submitBtn.disabled = true;
        spinner.classList.remove('hidden');
        btnText.classList.add('hidden');
        resultsArea.innerHTML = '';
        nextBar.classList.add('hidden');

        try {
            const { data, useFallback } = await fetchMedia(url);

            if (!data.media || data.media.length === 0) {
                errorMsg.textContent = 'No downloadable media found in this post.';
                return;
            }

            // Filter: video + image only (no audio-only tracks)
            const media = data.media.filter(isVideoTrack);

            if (media.length === 0) {
                errorMsg.textContent = 'No video or image media found in this post.';
                return;
            }

            renderResult(data, media, url, useFallback);

        } catch (err) {
            errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
        } finally {
            submitBtn.disabled = false;
            spinner.classList.add('hidden');
            btnText.classList.remove('hidden');
        }
    }

    submitBtn.addEventListener('click', () => handleFetch(urlInput.value));
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleFetch(urlInput.value);
    });

    // ── Render result card ────────────────────────────────────────────
    function renderResult(data, media, tweetUrl, useFallback) {
        const tweetId = getTweetId(tweetUrl);

        // Sort by numeric quality desc
        const sorted = [...media].sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

        // Build unique quality options (deduplicate)
        const seen = new Set();
        const qualities = sorted.filter(m => {
            if (seen.has(m.quality)) return false;
            seen.add(m.quality);
            return true;
        });

        let selectedQuality = qualities[0].quality;

        const card = document.createElement('div');
        card.className = 'result-card';
        card.id = 'result-card';

        card.innerHTML = `
            <div class="result-inner">
                <div class="thumb-wrap">
                    <img
                        src="${data.thumbnail || 'https://placehold.co/320x180/0E1420/4F5E78?text=Preview'}"
                        alt="Thumbnail"
                        loading="lazy"
                        onerror="this.src='https://placehold.co/320x180/0E1420/4F5E78?text=No+Preview'"
                    >
                </div>
                <div class="result-meta">
                    <span class="result-label">Quality</span>
                    <div class="quality-pills" id="quality-pills">
                        ${qualities.map((m, i) => `
                            <button
                                type="button"
                                class="quality-pill${i === 0 ? ' selected' : ''}"
                                data-quality="${m.quality}"
                            >${m.quality}${m.quality.includes('p') ? '' : 'p'}</button>
                        `).join('')}
                    </div>
                    <div class="result-actions">
                        <a
                            id="download-btn"
                            class="btn-download"
                            href="${makeProxyLink(selectedQuality, tweetUrl, tweetId, useFallback)}"
                            download
                        >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            Download
                        </a>
                    </div>
                </div>
            </div>
        `;

        resultsArea.innerHTML = '';
        resultsArea.appendChild(card);

        // Quality pill logic
        const pills = card.querySelectorAll('.quality-pill');
        const dlBtn = card.querySelector('#download-btn');

        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('selected'));
                pill.classList.add('selected');
                selectedQuality = pill.dataset.quality;
                dlBtn.href = makeProxyLink(selectedQuality, tweetUrl, tweetId, useFallback);
            });
        });

        // Track download click → show "next" bar, add to queue if needed
        dlBtn.addEventListener('click', () => {
            if (activeDownload) {
                // Already downloading — queue this one instead
                queueDownload(tweetUrl, selectedQuality, useFallback);
                return;
            }
            startDownload(dlBtn, tweetUrl, tweetId, selectedQuality, useFallback);
        });
    }

    // ── Download lifecycle ────────────────────────────────────────────
    function startDownload(btn, tweetUrl, tweetId, quality, useFallback) {
        activeDownload = true;

        // Visual feedback on the button
        btn.classList.add('downloading');
        btn.innerHTML = `<span class="spinner"></span> Downloading…`;

        // Show "paste next" bar immediately
        nextBar.classList.remove('hidden');
        nextInput.value = '';
        nextInput.focus();

        // Trigger the actual file download via anchor navigation
        const link = document.createElement('a');
        link.href = makeProxyLink(quality, tweetUrl, tweetId, useFallback);
        link.download = `tweet_${tweetId || Date.now()}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // There's no reliable "download complete" event in browsers.
        // We use a generous timeout; the user can also manually click "Next"
        // to start the queue. 45s covers most videos on typical connections.
        setTimeout(() => finishDownload(btn), 45000);
    }

    function finishDownload(btn) {
        activeDownload = false;

        // Restore button
        if (btn) {
            btn.classList.remove('downloading');
            btn.innerHTML = `
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download again
            `;
        }

        // Process queue
        if (downloadQueue.length > 0) {
            processNextInQueue();
        } else {
            // No queued items — hide the next bar
            nextBar.classList.add('hidden');
        }
    }

    // ── Queue ─────────────────────────────────────────────────────────
    let queueIdCounter = 0;

    function queueDownload(tweetUrl, quality, useFallback) {
        const id = ++queueIdCounter;
        downloadQueue.push({ id, tweetUrl, quality, useFallback });
        renderQueueItem(id, tweetUrl, 'pending');
        updateQueueUI();
    }

    function renderQueueItem(id, tweetUrl, status) {
        queueSection.classList.remove('hidden');
        const existing = document.getElementById(`qi-${id}`);
        if (existing) { updateQueueItemStatus(id, status); return; }

        const li = document.createElement('div');
        li.className = 'queue-item';
        li.id = `qi-${id}`;

        const statusLabels = { downloading: 'Downloading', pending: 'Queued', done: 'Done', error: 'Failed' };

        li.innerHTML = `
            <span class="queue-item-status ${status}"></span>
            <span class="queue-item-url">${tweetUrl}</span>
            <span class="queue-item-label ${status === 'done' ? 'done' : status === 'error' ? 'error' : ''}" id="qi-label-${id}">${statusLabels[status]}</span>
            ${status === 'pending' ? `<button class="queue-item-remove" aria-label="Remove" data-id="${id}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>` : ''}
        `;

        queueList.appendChild(li);

        const removeBtn = li.querySelector('.queue-item-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                const idx = downloadQueue.findIndex(i => i.id === Number(removeBtn.dataset.id));
                if (idx !== -1) downloadQueue.splice(idx, 1);
                li.remove();
                updateQueueUI();
            });
        }
    }

    function updateQueueItemStatus(id, status) {
        const dot   = document.querySelector(`#qi-${id} .queue-item-status`);
        const label = document.getElementById(`qi-label-${id}`);
        const removeBtn = document.querySelector(`#qi-${id} .queue-item-remove`);

        if (dot) { dot.className = `queue-item-status ${status}`; }
        if (label) {
            const statusLabels = { downloading: 'Downloading', pending: 'Queued', done: 'Done', error: 'Failed' };
            label.textContent = statusLabels[status] || status;
            label.className = `queue-item-label ${status === 'done' ? 'done' : status === 'error' ? 'error' : ''}`;
        }
        if (removeBtn && status !== 'pending') removeBtn.remove();
    }

    function updateQueueUI() {
        const pendingCount = downloadQueue.length;
        queueCount.textContent = pendingCount;
        if (pendingCount === 0 && queueList.querySelectorAll('.queue-item').length === 0) {
            queueSection.classList.add('hidden');
        }
    }

    async function processNextInQueue() {
        const item = downloadQueue.shift();
        if (!item) return;
        updateQueueUI();

        updateQueueItemStatus(item.id, 'downloading');
        activeDownload = true;

        // Fetch fresh media info for this queued tweet
        try {
            const { data, useFallback } = await fetchMedia(item.tweetUrl);
            const tweetId = getTweetId(item.tweetUrl);

            // Trigger download
            const link = document.createElement('a');
            link.href = makeProxyLink(item.quality, item.tweetUrl, tweetId, useFallback);
            link.download = `tweet_${tweetId || Date.now()}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            setTimeout(() => {
                updateQueueItemStatus(item.id, 'done');
                activeDownload = false;
                if (downloadQueue.length > 0) {
                    processNextInQueue();
                } else {
                    nextBar.classList.add('hidden');
                }
            }, 45000);

        } catch (err) {
            updateQueueItemStatus(item.id, 'error');
            activeDownload = false;
            if (downloadQueue.length > 0) processNextInQueue();
        }
    }

    // ── "Next" bar queue submit ───────────────────────────────────────
    function handleNextSubmit() {
        const raw = nextInput.value.trim();
        if (!raw) return;
        const url = cleanUrl(raw);
        if (!isValidTweetUrl(url)) {
            nextInput.style.borderColor = 'var(--error)';
            setTimeout(() => { nextInput.style.borderColor = ''; }, 1500);
            return;
        }
        nextInput.value = '';

        if (activeDownload) {
            queueDownload(url, '720p', false); // default quality for queued items
        } else {
            // No active download — just load it as the main fetch
            urlInput.value = url;
            handleFetch(url);
        }
    }

    nextBtn.addEventListener('click', handleNextSubmit);
    nextInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleNextSubmit(); });

    // ── "Download complete" shortcut: user clicks "Done" manually ────
    // (nothing needed — the finishDownload timeout handles it)

});
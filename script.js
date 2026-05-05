






document.addEventListener('DOMContentLoaded', () => {

    // ── API ─────────────────────────────────────────────────────────────────
    const API_URL = 'https://tweetsaver-api.onrender.com/api/download';
    const PROXY_URL = 'https://tweetsaver-api.onrender.com/api/proxy_download';
    
    const API_KEY = '';   // set only if you enabled API_KEY on the backend

    // ── Tiny helper – get the tweet ID from a URL ───────────────────────────
    const getTweetId = (url) => {
        const match = url.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
    };

    // ── Theme, mobile nav, etc. (unchanged) ──────────────────────────────────
    // ... (keep everything from your existing script) ...

    // ── Download form (homepage only) ────────────────────────────────────────
    const form = document.getElementById('download-form');
    if (form) {
        const isValidTweetUrl = (url) =>
            /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/\d+(\?.*)?$/.test(url);

        const urlInput = document.getElementById('tweet-url');
        const errorMsg = document.getElementById('error-msg');
        const submitBtn = document.getElementById('submit-btn');
        const spinner = submitBtn.querySelector('.spinner');
        const btnText = submitBtn.querySelector('.btn-text');
        const resultsSection = document.getElementById('results-section');
        const thumbnailImg = document.getElementById('thumbnail-img');
        const qualityDropdown = document.getElementById('quality-dropdown');
        const downloadBtn = document.getElementById('download-btn');

        let currentMediaData = null;

        // Helper to build a proxy link with a unique filename
        const makeProxyLink = (videoUrl, tweetId) => {
            const baseName = tweetId ? `tweet_${tweetId}` : 'video';
            return `${PROXY_URL}?video_url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(baseName + '.mp4')}`;
        };

        qualityDropdown?.addEventListener('change', (e) => {
            const selected = currentMediaData?.media?.find(m => m.quality === e.target.value);
            if (selected) {
                const tweetId = getTweetId(urlInput.value.trim());
                downloadBtn.href = makeProxyLink(selected.url, tweetId);
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
                renderResults(data, url);
            } catch (err) {
                errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
            } finally {
                submitBtn.disabled = false;
                spinner.classList.add('hidden');
                btnText.classList.remove('hidden');
            }
        });

        function renderResults(data, originalUrl) {
            resultsSection.classList.remove('hidden');

            if (!data.media || data.media.length === 0) {
                errorMsg.textContent = 'No downloadable media found in this tweet.';
                return;
            }

            const tweetId = getTweetId(originalUrl);

            const sortedMedia = [...data.media].sort((a, b) => parseInt(b.quality) - parseInt(a.quality));

            // Limit to 3 versions as before
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
                downloadBtn.href = makeProxyLink(displayMedia[0].url, tweetId);
            }

            if (displayMedia.length > 1) {
                const listCard = document.createElement('div');
                listCard.className = 'card extra-media-card';
                listCard.innerHTML = '<h3>All Available Qualities</h3>';
                const ul = document.createElement('ul');
                ul.className = 'media-list';
                displayMedia.forEach(m => {
                    const li = document.createElement('li');
                    li.innerHTML = `<a href="${makeProxyLink(m.url, tweetId)}" download>${m.quality}${m.quality.includes('p') ? '' : 'p'} — ${m.type}</a>`;
                    ul.appendChild(li);
                });
                listCard.appendChild(ul);
                resultsSection.appendChild(listCard);
            }
        }
    }

    // ── Contact form (unchanged) ─────────────────────────────────────────────
    // ... (keep your existing contact form code) ...
});






document.addEventListener('DOMContentLoaded', () => {

    // =============================================================
    // API URL CONFIGURATION
    // -------------------------------------------------------------
    // Since Flask serves both the frontend AND the backend from the
    // same server (on Render), you can always use a relative path.
    // '/api/download' works on localhost AND in production.
    //
    // Only change API_URL if you ever move the frontend to a
    // separate host (e.g. Vercel). In that case, replace the empty
    // string below with your full Render URL:
    //   const BACKEND = 'https://YOUR-APP.onrender.com';
    // =============================================================
    const BACKEND = '';   // <-- leave empty: same server serves front + back
    const API_URL = `${BACKEND}/api/download`;

    // Optional: set this only if you enabled API_KEY on the backend
    const API_KEY = '';

    // ----- Theme toggle -----
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;

    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);

    themeToggle?.addEventListener('click', () => {
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });

    // ----- Mobile navigation -----
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.getElementById('nav-menu');

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

    // ----- Download form (homepage only) -----
    const form = document.getElementById('download-form');
    if (!form) return;   // not on homepage — stop here

    const isValidTweetUrl = (url) =>
        /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/\d+(\?.*)?$/.test(url);

    const urlInput       = document.getElementById('tweet-url');
    const errorMsg       = document.getElementById('error-msg');
    const submitBtn      = document.getElementById('submit-btn');
    const spinner        = submitBtn.querySelector('.spinner');
    const btnText        = submitBtn.querySelector('.btn-text');
    const resultsSection = document.getElementById('results-section');
    const thumbnailImg   = document.getElementById('thumbnail-img');
    const qualityDropdown = document.getElementById('quality-dropdown');
    const downloadBtn    = document.getElementById('download-btn');
    const copyLinkBtn    = document.getElementById('copy-link-btn');

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

    qualityDropdown?.addEventListener('change', (e) => {
        const selected = currentMediaData?.media?.find(m => m.quality === e.target.value);
        if (selected) downloadBtn.href = selected.url;
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
        // Clear any previous extra media cards
        document.querySelectorAll('.extra-media-card').forEach(el => el.remove());
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

        if (sortedMedia.length > 0) {
            downloadBtn.href = sortedMedia[0].url;
        }

        if (sortedMedia.length > 1) {
            const listCard = document.createElement('div');
            listCard.className = 'card extra-media-card';
            listCard.innerHTML = '<h3>All Available Qualities</h3>';
            const ul = document.createElement('ul');
            ul.className = 'media-list';
            sortedMedia.forEach(m => {
                const li = document.createElement('li');
                li.innerHTML = `<a href="${m.url}" download>${m.quality}${m.quality.includes('p') ? '' : 'p'} — ${m.type}</a>`;
                ul.appendChild(li);
            });
            listCard.appendChild(ul);
            resultsSection.appendChild(listCard);
        }
    }

    // ----- Contact form (demo) -----
    const contactForm = document.getElementById('contact-form');
    contactForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        alert('Thanks for your message! (demo — no emails are sent yet)');
        contactForm.reset();
    });
});
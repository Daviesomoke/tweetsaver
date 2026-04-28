






document.addEventListener('DOMContentLoaded', () => {
    const themeToggle = document.getElementById('theme-toggle');
    const html = document.documentElement;

    themeToggle.addEventListener('click', () => {
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });

    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);

    // Mobile navigation toggle
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.getElementById('nav-menu');

    if (navToggle && navMenu) {
        navToggle.addEventListener('click', () => {
            const expanded = navToggle.getAttribute('aria-expanded') === 'true' || false;
            navToggle.setAttribute('aria-expanded', !expanded);
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

    // URL validation (only on homepage)
    const form = document.getElementById('download-form');
    if (!form) return;

    const isValidTweetUrl = (url) => {
        const pattern = /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/[a-zA-Z0-9_]+\/status\/\d+(\?.*)?$/;
        return pattern.test(url);
    };

    const urlInput = document.getElementById('tweet-url');
    const errorMsg = document.getElementById('error-msg');
    const submitBtn = document.getElementById('submit-btn');
    const spinner = submitBtn.querySelector('.spinner');
    const btnText = submitBtn.querySelector('.btn-text');
    const resultsSection = document.getElementById('results-section');
    const thumbnailImg = document.getElementById('thumbnail-img');
    const qualityDropdown = document.getElementById('quality-dropdown');
    const downloadBtn = document.getElementById('download-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const multipleMediaList = document.getElementById('multiple-media-list');

    let currentMediaData = null;

    copyLinkBtn?.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(urlInput.value);
            alert('Link copied!');
        } catch {
            alert('Failed to copy');
        }
    });

    qualityDropdown?.addEventListener('change', (e) => {
        if (currentMediaData && currentMediaData.media) {
            const selected = currentMediaData.media.find(m => m.quality === e.target.value);
            if (selected) {
                downloadBtn.href = selected.url;
            }
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = urlInput.value.trim();

        if (!isValidTweetUrl(url)) {
            errorMsg.textContent = 'Please enter a valid X/Twitter post URL (e.g., https://x.com/user/status/123456)';
            return;
        }

        errorMsg.textContent = '';
        submitBtn.disabled = true;
        spinner.classList.remove('hidden');
        btnText.classList.add('hidden');
        resultsSection.classList.add('hidden');

        try {
            const response = await fetch('/api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch media');
            }

            const data = await response.json();
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
        multipleMediaList.innerHTML = '';
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
            option.textContent = `${m.quality}${m.quality.includes('p') ? '' : 'p'} - ${m.type.toUpperCase()}`;
            qualityDropdown.appendChild(option);
        });

        if (sortedMedia.length > 0) {
            downloadBtn.href = sortedMedia[0].url;
        }

        if (sortedMedia.length > 1) {
            const listCard = document.createElement('div');
            listCard.className = 'card';
            listCard.innerHTML = `<h3>All Media</h3>`;
            const ul = document.createElement('ul');
            ul.className = 'media-list';
            sortedMedia.forEach(m => {
                const li = document.createElement('li');
                li.innerHTML = `<a href="${m.url}" download>${m.quality}p</a>`;
                ul.appendChild(li);
            });
            listCard.appendChild(ul);
            resultsSection.appendChild(listCard);
        }
    }

    // Contact form dummy
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('Thanks for your message! (demo)');
        });
    }
});






from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import re
import logging
from time import time
from collections import defaultdict

# In production, use yt-dlp with cookies. For demo we simulate extraction.
# Uncomment yt-dlp imports when ready.
# import yt_dlp

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# Simple in‑memory rate limiting
rate_limit_store = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # seconds
MAX_REQUESTS = 10

def is_rate_limited(ip):
    now = time()
    window = now - RATE_LIMIT_WINDOW
    rate_limit_store[ip] = [t for t in rate_limit_store[ip] if t > window]
    if len(rate_limit_store[ip]) >= MAX_REQUESTS:
        return True
    rate_limit_store[ip].append(now)
    return False

def extract_tweet_id(url):
    pattern = r'/status/(\d+)'
    match = re.search(pattern, url)
    return match.group(1) if match else None

def fetch_media_info_real(url):
    """
    Real implementation using yt-dlp.
    Needs a cookies.txt file from an authenticated X session
    to bypass restrictions.
    """
    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'cookiefile': 'cookies.txt',  # place your cookies file here
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            media_list = []
            if 'entries' in info:
                # Playlist? Just take first
                info = info['entries'][0]
            if 'formats' in info:
                for f in info['formats']:
                    if f.get('vcodec') != 'none' or f.get('acodec') != 'none':
                        quality = f.get('height') or f.get('format_note') or 'unknown'
                        media_list.append({
                            'quality': f'{quality}p' if isinstance(quality, int) else quality,
                            'url': f['url'],
                            'type': 'video' if f.get('vcodec') != 'none' else 'audio',
                        })
            elif 'thumbnail' in info:
                # Image tweet
                media_list.append({
                    'quality': 'original',
                    'url': info['thumbnail'],
                    'type': 'image',
                })
            return {
                'tweet_id': info.get('id', extract_tweet_id(url)),
                'thumbnail': info.get('thumbnail', ''),
                'media': media_list
            }
    except Exception as e:
        raise RuntimeError(f"yt-dlp error: {str(e)}")

def fetch_media_info_demo(url):
    """Demo response that simulates media extraction for testing."""
    tweet_id = extract_tweet_id(url)
    if not tweet_id:
        raise ValueError("Invalid tweet URL")
    sample_media = [
        {"quality": "1080p", "url": "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4", "type": "video"},
        {"quality": "720p", "url": "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4", "type": "video"},
        {"quality": "480p", "url": "https://sample-videos.com/video321/mp4/480/big_buck_bunny_480p_1mb.mp4", "type": "video"},
    ]
    return {
        "tweet_id": tweet_id,
        "thumbnail": "https://placehold.co/480x270/1a1a1a/ffffff?text=Preview",
        "media": sample_media
    }

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/<path:path>')
def static_files(path):
    return app.send_static_file(path)

@app.route('/api/download', methods=['POST'])
def download():
    client_ip = request.remote_addr
    if is_rate_limited(client_ip):
        return jsonify({"error": "Too many requests. Please wait a minute."}), 429

    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({"error": "Missing 'url' in request"}), 400

    url = data['url'].strip()
    if not re.match(r'^https?://(www\.)?(twitter\.com|x\.com)/', url):
        return jsonify({"error": "Invalid X / Twitter URL"}), 400

    try:
        # Switch to real implementation when cookies are set up
        # media_info = fetch_media_info_real(url)
        media_info = fetch_media_info_demo(url)
        return jsonify(media_info)
    except Exception as e:
        app.logger.error(f"Download error: {e}")
        return jsonify({"error": f"Could not retrieve media: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
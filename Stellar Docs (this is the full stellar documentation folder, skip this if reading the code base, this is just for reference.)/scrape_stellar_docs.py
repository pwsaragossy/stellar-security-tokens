#!/usr/bin/env python3
"""
Stellar Docs Scraper - Converts Stellar developer documentation to Obsidian-friendly markdown.
"""

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md
import os
import re
import json
import time
from urllib.parse import urljoin, urlparse

BASE_URL = "https://developers.stellar.org"
OUTPUT_DIR = "/Users/pedrosaragossy/Workspace/Stellar Docs"

# Define sections to scrape with their paths
SECTIONS = {
    "build": "/docs/build",
    "learn": "/docs/learn/fundamentals", 
    "tokens": "/docs/tokens",
    "data": "/docs/data",
    "tools": "/docs/tools",
    "networks": "/docs/networks",
    "validators": "/docs/validators",
}

# Track visited URLs to avoid duplicates
visited = set()

def clean_filename(title: str) -> str:
    """Convert title to valid filename."""
    # Remove special chars, convert to lowercase with hyphens
    clean = re.sub(r'[^\w\s-]', '', title.lower())
    clean = re.sub(r'[\s_]+', '-', clean)
    return clean[:50]  # Limit length

def get_page_content(url: str) -> tuple:
    """Fetch and parse a page, returning (title, content_html, links)."""
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Get title
        title_el = soup.find('h1')
        title = title_el.get_text(strip=True) if title_el else "Untitled"
        
        # Get main content (Docusaurus uses article or main)
        content = soup.find('article') or soup.find('main') or soup.find('div', class_='markdown')
        
        # Remove navigation, footer, sidebars
        for el in soup.find_all(['nav', 'footer', 'aside']):
            el.decompose()
        
        # Find internal documentation links
        links = []
        if content:
            for a in content.find_all('a', href=True):
                href = a['href']
                if href.startswith('/docs/'):
                    links.append(urljoin(BASE_URL, href))
        
        return title, content, links
    except Exception as e:
        print(f"  Error fetching {url}: {e}")
        return None, None, []

def html_to_markdown(html_content, base_url: str) -> str:
    """Convert HTML to clean markdown."""
    if not html_content:
        return ""
    
    # Convert to markdown
    markdown = md(str(html_content), heading_style="ATX", code_language="")
    
    # Clean up excessive newlines
    markdown = re.sub(r'\n{3,}', '\n\n', markdown)
    
    # Convert absolute links to relative where possible
    markdown = markdown.replace('https://developers.stellar.org/docs/', '../')
    
    return markdown.strip()

def url_to_filepath(url: str) -> str:
    """Convert URL to local file path."""
    parsed = urlparse(url)
    path = parsed.path.replace('/docs/', '')
    if not path or path == '/':
        path = 'index'
    # Remove trailing slashes
    path = path.rstrip('/')
    return os.path.join(OUTPUT_DIR, f"{path}.md")

def scrape_page(url: str, depth: int = 0, max_depth: int = 3):
    """Recursively scrape a page and its linked pages."""
    if url in visited or depth > max_depth:
        return
    
    # Only process docs pages
    if '/docs/' not in url:
        return
    
    visited.add(url)
    print(f"{'  ' * depth}Scraping: {url}")
    
    title, content, links = get_page_content(url)
    if not content:
        return
    
    # Convert to markdown
    markdown = html_to_markdown(content, url)
    
    # Add title header if not present
    if not markdown.startswith('# '):
        markdown = f"# {title}\n\n{markdown}"
    
    # Determine output path
    filepath = url_to_filepath(url)
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    
    # Write file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(markdown)
    
    print(f"{'  ' * depth}  -> Saved: {filepath}")
    
    # Small delay to be polite
    time.sleep(0.3)
    
    # Recursively scrape linked pages
    for link in links:
        scrape_page(link, depth + 1, max_depth)

def scrape_section(name: str, path: str):
    """Scrape an entire section."""
    print(f"\n=== Scraping section: {name} ===")
    url = urljoin(BASE_URL, path)
    scrape_page(url, max_depth=4)

def create_moc():
    """Create a master Map of Content file."""
    moc_content = """# Stellar Developer Documentation
## Map of Content

Stellar is a layer-1 open-source, decentralized, peer-to-peer blockchain network.

---

## Sections

"""
    
    for section in ["build", "learn", "tokens", "data", "tools", "networks", "validators"]:
        moc_content += f"### [{section.title()}]({section}/_index.md)\n\n"
    
    with open(os.path.join(OUTPUT_DIR, "MOC.md"), 'w') as f:
        f.write(moc_content)

def main():
    print("Stellar Docs Scraper")
    print("=" * 50)
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Scrape each section
    for name, path in SECTIONS.items():
        scrape_section(name, path)
    
    # Create MOC
    create_moc()
    
    print(f"\n\nDone! Scraped {len(visited)} pages.")
    print(f"Output directory: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()

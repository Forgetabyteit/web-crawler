const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');

puppeteer.use(StealthPlugin());

// Configuration constants
const CONFIG = {
  BASE_URL: 'https://example.com',
  SELECTORS: ['main', 'article', 'div[role="main"]', 'div.main-content', 'div.content', 'div.page-content'],
  OUTPUT_DIR: 'crawled_pages',
  MAX_DEPTH: 3,
  CONCURRENCY: 5,
  RATE_LIMIT_DELAY: 3000,
  TIMEOUT_DURATION: 30000,
  MAX_ATTEMPTS: 5,
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  ACCEPT_LANGUAGE: 'en-US,en;q=0.9'
};

// Ensure output directory exists
if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
  fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
}

// Initialize Turndown Service
const turndownService = new TurndownService();
turndownService.use(turndownPluginGfm.gfm);

// Function to create directories and save markdown files
const saveMarkdown = (url, content) => {
  const urlPath = new URL(url).pathname;
  const pathParts = urlPath.split('/').filter(part => part);
  const dirPath = path.join(CONFIG.OUTPUT_DIR, ...pathParts.slice(0, -1));
  const fileName = `${pathParts[pathParts.length - 1]}.md`;
  const filePath = path.join(dirPath, fileName);

  fs.mkdirSync(dirPath, { recursive: true });
  const markdown = turndownService.turndown(content);
  fs.writeFileSync(filePath, markdown, 'utf8');
  console.log(`Saved: ${url}`);
};

// Main function
(async () => {
  const visitedUrls = new Set([CONFIG.BASE_URL]);

  // Cluster task function
  const crawlPage = async ({ page, data: { url, depth } }) => {
    if (depth > CONFIG.MAX_DEPTH) return;

    await page.setUserAgent(CONFIG.USER_AGENT);
    await page.setExtraHTTPHeaders({ 'Accept-Language': CONFIG.ACCEPT_LANGUAGE });

    for (let attempt = 1; attempt <= CONFIG.MAX_ATTEMPTS; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT_DURATION });

        const mainContent = await page.evaluate((selectors) => {
          for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) return element.innerHTML;
          }
          return '';
        }, CONFIG.SELECTORS);

        if (mainContent) {
          saveMarkdown(url, mainContent);
        }

        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a')).map(link => link.href)
        );

        links.forEach(href => {
          const absoluteUrl = new URL(href, CONFIG.BASE_URL).href.split('#')[0];
          if (absoluteUrl.startsWith(CONFIG.BASE_URL) && !visitedUrls.has(absoluteUrl)) {
            cluster.queue({ url: absoluteUrl, depth: depth + 1 });
            visitedUrls.add(absoluteUrl);
          }
        });

        await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
        break; // Exit loop if successful
      } catch (error) {
        console.log(`Attempt ${attempt} failed: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, CONFIG.RATE_LIMIT_DELAY));
      }
    }
  };

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: CONFIG.CONCURRENCY,
    puppeteerOptions: {
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    workerCreationDelay: 100,
    timeout: CONFIG.TIMEOUT_DURATION,
  });

  cluster.on('taskerror', (err, data) => {
    console.log(`Error crawling ${data.url}: ${err.message}`);
  });

  cluster.task(crawlPage);

  cluster.queue({ url: CONFIG.BASE_URL, depth: 0 });
  await cluster.idle();
  await cluster.close();
  console.log('Crawling completed.');
})();

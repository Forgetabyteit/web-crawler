const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');

puppeteer.use(StealthPlugin());

const baseUrl = 'https://example.com';
const outputDir = 'crawled_pages';
const maxDepth = 3;
const concurrency = 5;
const rateLimitDelay = 1000;
const timeoutDuration = 30000;

(async () => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: concurrency,
    puppeteerOptions: {
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
    workerCreationDelay: 100,
    timeout: timeoutDuration,
  });

  const visitedUrls = new Set([baseUrl]);

  await cluster.task(async ({ page, data: { url, depth } }) => {
    if (depth > maxDepth) return;

    await page.goto(url, { waitUntil: 'networkidle0', timeout: timeoutDuration });
    const mainContent = await page.evaluate(() => {
      const selectors = ['main', 'article', 'div[role="main"]', 'div.main-content', 'div.content', 'div.page-content'];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) return element.innerHTML;
      }
      return '';
    });

    const urlPath = new URL(url).pathname;
    const sanitizedPath = urlPath.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
    const fileName = `${sanitizedPath}.md`;
    const filePath = path.join(outputDir, fileName);

    const turndownService = new TurndownService();
    turndownService.use(turndownPluginGfm.gfm);
    const markdown = turndownService.turndown(mainContent);
    fs.writeFileSync(filePath, markdown, 'utf8');

    console.log(`Saved: ${url}`);

    const links = await page.evaluate(() => Array.from(document.querySelectorAll('a')).map(link => link.href));
    links.forEach(href => {
      const absoluteUrl = new URL(href, baseUrl).href.split('#')[0]; // Normalize URL
      if (!visitedUrls.has(absoluteUrl)) {
        cluster.queue({ url: absoluteUrl, depth: depth + 1 });
        visitedUrls.add(absoluteUrl);
      }
    });

    await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
  });

  cluster.queue({ url: baseUrl, depth: 0 });
  await cluster.idle();
  await cluster.close();

  console.log('Crawling completed.');
})();

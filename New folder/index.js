const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const TurndownService = require('turndown');
const turndownPluginGfm = require('turndown-plugin-gfm');

puppeteer.use(StealthPlugin());

const baseUrl = 'https://example.com'; // Starting URL for the crawl
const outputDir = 'crawled_pages'; // Directory to save the crawled pages
const maxDepth = 3; // Maximum depth of the crawl
const concurrency = 5; // Number of concurrent workers
const rateLimitDelay = 1000; // Delay between requests to avoid rate limiting
const timeoutDuration = 30000; // Maximum timeout for page navigation

(async () => {
  // Create the output directory if it doesn't exist
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
    puppeteerWrapper: puppeteer,
    timeout: timeoutDuration,
  });

  const visitedUrls = new Set();
  const urlQueue = [{ url: baseUrl, depth: 0 }];

  cluster.on('taskerror', (err, data) => {
    console.error(`Error crawling: ${data.url}`);
    console.error(err);
    // Add the failed URL back to the end of the queue for retrying
    urlQueue.push({ url: data.url, depth: data.depth });
  });

  await cluster.task(async ({ page, data: { url, depth } }) => {
    if (depth > maxDepth) {
      return;
    }

    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: timeoutDuration });

      // Extract the main content using a combination of selectors
      const mainContent = await page.evaluate(() => {
        const selectors = [
          'main',
          'article',
          'div[role="main"]',
          'div.main-content',
          'div.content',
          'div.page-content',
        ];

        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            return element.innerHTML;
          }
        }

        return '';
      });

      // Create a unique filename based on the URL path
      const urlPath = new URL(url).pathname;
      const sanitizedPath = urlPath.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 100);
      const fileName = `${sanitizedPath}.md`;
      const filePath = path.join(outputDir, fileName);

      // Initialize Turndown service with GFM plugin
      const turndownService = new TurndownService();
      turndownService.use(turndownPluginGfm.gfm);

      // Convert the main content to Markdown
      const markdown = turndownService.turndown(mainContent);

      // Save the Markdown to a file
      fs.writeFileSync(filePath, markdown, 'utf8');

      console.log(`Saved: ${url}`);

      // Find all the links on the page
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a'))
          .map((link) => link.href)
          .filter((href) => {
            const url = new URL(href, window.location.origin);
            return url.origin === window.location.origin;
          });
      });

      // Add new links to the queue
      for (const link of links) {
        const absoluteUrl = new URL(link, baseUrl).href;
        // Remove the hash fragment from the URL
        const cleanedUrl = absoluteUrl.split('#')[0];
        if (!visitedUrls.has(cleanedUrl)) {
          urlQueue.push({ url: cleanedUrl, depth: depth + 1 });
          visitedUrls.add(cleanedUrl);
        }
      }

      // Delay before processing the next URL to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, rateLimitDelay));
    } catch (error) {
      console.error(`Error crawling: ${url}`);
      console.error(error);
      // Add the failed URL back to the end of the queue for retrying
      urlQueue.push({ url, depth });
    }
  });

  // Process URLs from the queue until it's empty
  while (urlQueue.length > 0) {
    const { url, depth } = urlQueue.shift();
    await cluster.execute({ url, depth });
  }

  await cluster.idle();
  await cluster.close();

  console.log('Crawling completed.');
})();
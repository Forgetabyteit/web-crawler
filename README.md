This project is a web crawler built using Puppeteer-Cluster, designed to efficiently and reliably crawl websites, extract their main content, and convert it into Markdown files for archiving or further processing.

**Key Features:**

* **Concurrent Crawling:** Leverages Puppeteer-Cluster for parallel processing, speeding up the crawling process.
* **Stealth Mode:** Employs Puppeteer-extra-plugin-stealth to avoid detection by websites that block automated tools.
* **Content Extraction:** Intelligently identifies and extracts the main content of webpages using configurable CSS selectors.
* **Markdown Conversion:** Transforms extracted content into Markdown format using Turndown and the GFM plugin for better formatting.
* **Depth Control:** Limits the crawl depth to avoid getting stuck in infinite loops or crawling irrelevant pages.
* **Rate Limiting:** Implements delays between requests to prevent overwhelming the target server and avoid rate limiting.
* **Error Handling:** Gracefully handles errors and retries failed requests to ensure robust operation.

## Getting Started

1. **Clone the repository:**

    ```bash
    git clone https://github.com/Forgetabyteit/web-crawler.git
    ```

2. **Install dependencies:**

    ```bash
    cd web-crawler
    npm install
    ```

3. **Configure the crawler:**

    Update the configuration settings in `index.js`:
    * **`CONFIG.BASE_URL`:** Set the starting URL for the crawl.
    * **`CONFIG.OUTPUT_DIR`:** Specify the directory where the crawled Markdown files will be saved.
    * **`CONFIG.MAX_DEPTH`:** Adjust the maximum crawl depth as needed.
    * **`CONFIG.CONCURRENCY`:** Control the number of concurrent workers for parallel crawling.
    * **`CONFIG.RATE_LIMIT_DELAY`:** Modify the delay between requests to optimize for the target website.
    * **`CONFIG.SELECTORS`:** Define the CSS selectors used to extract the main content from the webpages.

4. **Run the crawler:**

    ```bash
    node index.js
    ```

## How it Works

1. The crawler starts with a queue containing the base URL and initializes a Puppeteer-Cluster with a specified number of workers.
2. Each worker navigates to a URL from the queue, extracts the main content using the defined selectors, and converts it to Markdown using Turndown.
3. The Markdown content is saved to a file named based on the URL path.
4. The crawler then identifies all links on the page, filters out external links and already visited URLs, and adds new unique links to the queue for further crawling.
5. This process continues until the queue is empty or the maximum depth is reached.

## Contributing

Contributions are welcome! Feel free to submit pull requests for bug fixes, enhancements, or new features.

## License

This project is licensed under the MIT License. See the LICENSE file for details.

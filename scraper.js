#!/usr/bin/env node

const { chromium } = require('playwright');
const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');

// 載入預設配置
const presetsPath = path.join(__dirname, 'presets.json');
const presets = JSON.parse(fs.readFileSync(presetsPath, 'utf-8'));

// CLI 配置
program
  .name('doc-scraper')
  .description('通用文檔爬蟲工具 - 將任何技術文檔網站轉換為 Markdown，便於匯入 NotebookLM 學習')
  .version('1.0.0');

program
  .command('list')
  .description('列出所有可用的預設配置')
  .action(() => {
    console.log(chalk.cyan('\n📚 可用的預設配置:\n'));
    Object.entries(presets).forEach(([key, preset]) => {
      console.log(chalk.yellow(`  ${key.padEnd(20)}`), chalk.gray(preset.name));
      if (preset.url) {
        console.log(chalk.gray(`  ${''.padEnd(20)} ${preset.url}`));
      }
    });
    console.log(chalk.gray('\n使用方式: doc-scraper scrape <preset> [options]\n'));
  });

program
  .command('scrape <preset>')
  .description('爬取指定網站的文檔內容')
  .option('-u, --url <url>', '覆蓋預設的網站 URL')
  .option('-o, --output <dir>', '輸出目錄', './output')
  .option('-c, --combined <file>', '合併檔案名稱', 'combined.md')
  .option('--content-selector <selector>', '覆蓋內容選擇器')
  .option('--link-selector <selector>', '覆蓋連結選擇器')
  .option('--wait <ms>', '頁面等待時間 (毫秒)', parseInt)
  .option('--timeout <ms>', '頁面超時時間 (毫秒)', parseInt)
  .option('--max-pages <n>', '最大爬取頁數', parseInt)
  .option('--headless', '無頭模式 (預設)', true)
  .option('--no-headless', '顯示瀏覽器視窗')
  .action(async (presetName, options) => {
    await runScraper(presetName, options);
  });

program
  .command('quick <url>')
  .description('快速爬取指定 URL（自動偵測網站類型）')
  .option('-o, --output <dir>', '輸出目錄', './output')
  .action(async (url, options) => {
    await runScraper('custom', { ...options, url });
  });

program.parse();

// 主爬蟲邏輯
async function runScraper(presetName, options) {
  // 載入預設配置
  const preset = presets[presetName];
  if (!preset) {
    console.error(chalk.red(`\n❌ 找不到預設配置: ${presetName}`));
    console.log(chalk.gray('使用 "doc-scraper list" 查看可用配置\n'));
    process.exit(1);
  }

  // 合併配置
  const config = {
    ...preset,
    url: options.url || preset.url,
    outputDir: path.resolve(options.output),
    combinedFile: options.combined,
    contentSelector: options.contentSelector || preset.contentSelector,
    linkSelector: options.linkSelector || preset.linkSelector,
    waitTime: options.wait || preset.waitTime,
    timeout: options.timeout || preset.timeout,
    maxPages: options.maxPages || Infinity,
    headless: options.headless
  };

  if (!config.url) {
    console.error(chalk.red('\n❌ 請提供網站 URL'));
    console.log(chalk.gray('使用 --url <url> 指定網站\n'));
    process.exit(1);
  }

  console.log(chalk.cyan('\n🚀 Doc Scraper - 文檔爬蟲工具\n'));
  console.log(chalk.gray('配置:'));
  console.log(chalk.gray(`  預設: ${preset.name}`));
  console.log(chalk.gray(`  網站: ${config.url}`));
  console.log(chalk.gray(`  輸出: ${config.outputDir}`));
  console.log(chalk.gray(`  等待: ${config.waitTime}ms`));
  console.log('');

  // 建立輸出目錄
  const contentDir = path.join(config.outputDir, 'content');
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }

  const spinner = ora('啟動瀏覽器...').start();

  try {
    const browser = await chromium.launch({ headless: config.headless });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    });
    const page = await context.newPage();

    // Step 1: 獲取所有連結
    spinner.text = '正在獲取文檔目錄...';
    const indexUrl = config.url + config.indexPath;
    await page.goto(indexUrl, { waitUntil: 'networkidle', timeout: config.timeout });
    await sleep(config.waitTime);

    const links = await page.evaluate((cfg) => {
      const allLinks = Array.from(document.querySelectorAll(cfg.linkSelector));
      return allLinks
        .map(a => ({
          text: a.innerText.trim().replace(/\n/g, ' ').substring(0, 100),
          href: a.href
        }))
        .filter(l => {
          if (!l.href || !l.text) return false;
          if (cfg.linkFilter && !l.href.includes(cfg.linkFilter)) return false;
          for (const pattern of cfg.excludePatterns) {
            if (l.href.includes(pattern) || l.href.endsWith(pattern)) return false;
          }
          return true;
        });
    }, config);

    // 去重
    const uniqueLinks = [...new Map(links.map(l => [l.href, l])).values()];
    const pagesToScrape = uniqueLinks.slice(0, config.maxPages);

    spinner.succeed(`找到 ${chalk.green(pagesToScrape.length)} 個頁面`);
    console.log('');

    // Step 2: 逐一爬取
    let allContent = generateHeader(config, pagesToScrape.length);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pagesToScrape.length; i++) {
      const link = pagesToScrape[i];
      const progress = `[${String(i + 1).padStart(3)}/${pagesToScrape.length}]`;

      spinner.start(`${progress} ${link.text.substring(0, 50)}...`);

      try {
        await page.goto(link.href, { waitUntil: 'networkidle', timeout: config.timeout });
        await sleep(config.waitTime);

        // 提取內容
        const content = await page.evaluate((cfg) => {
          // 嘗試主選擇器
          let el = document.querySelector(cfg.contentSelector);

          // 嘗試備用選擇器
          if (!el && cfg.fallbackSelectors) {
            for (const selector of cfg.fallbackSelectors) {
              el = document.querySelector(selector);
              if (el) break;
            }
          }

          if (!el) return '';

          // 移除不需要的元素
          const clone = el.cloneNode(true);
          clone.querySelectorAll('script, style, nav, .sidebar, .toc').forEach(e => e.remove());

          return clone.innerText.trim();
        }, config);

        const title = await page.title();

        if (content && content.length > 50) {
          // 儲存個別檔案
          const safeFilename = `${String(i + 1).padStart(3)}-${sanitizeFilename(link.text)}.md`;
          const filePath = path.join(contentDir, safeFilename);

          const fileContent = `# ${link.text}\n\n> 來源: ${link.href}\n\n${content}\n`;
          fs.writeFileSync(filePath, fileContent, 'utf-8');

          // 加入合併檔案
          allContent += `## ${link.text}\n\n`;
          allContent += `> 來源: ${link.href}\n\n`;
          allContent += `${content}\n\n`;
          allContent += `---\n\n`;

          spinner.succeed(`${progress} ${chalk.green('✓')} ${link.text.substring(0, 40)} (${formatBytes(content.length)})`);
          successCount++;
        } else {
          spinner.warn(`${progress} ${chalk.yellow('⚠')} ${link.text.substring(0, 40)} (內容為空)`);
          failCount++;
        }
      } catch (error) {
        spinner.fail(`${progress} ${chalk.red('✗')} ${link.text.substring(0, 40)} (${error.message.substring(0, 30)})`);
        failCount++;
      }

      await sleep(300); // 避免請求過快
    }

    // 儲存合併檔案
    const combinedPath = path.join(config.outputDir, config.combinedFile);
    fs.writeFileSync(combinedPath, allContent, 'utf-8');

    await browser.close();

    // 輸出結果
    console.log('');
    console.log(chalk.cyan('═'.repeat(50)));
    console.log(chalk.green('\n✅ 爬取完成!\n'));
    console.log(chalk.gray('統計:'));
    console.log(chalk.gray(`  成功: ${chalk.green(successCount)} 頁`));
    console.log(chalk.gray(`  失敗: ${chalk.red(failCount)} 頁`));
    console.log('');
    console.log(chalk.gray('輸出檔案:'));
    console.log(chalk.yellow(`  📄 合併檔案: ${combinedPath}`));
    console.log(chalk.yellow(`  📁 個別章節: ${contentDir}/`));
    console.log('');
    console.log(chalk.cyan('下一步: 將合併檔案匯入 NotebookLM 開始學習!'));
    console.log(chalk.gray('https://notebooklm.google.com\n'));

  } catch (error) {
    spinner.fail(`爬取失敗: ${error.message}`);
    process.exit(1);
  }
}

// 工具函數
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeFilename(name) {
  return name
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .substring(0, 80);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function generateHeader(config, pageCount) {
  return `# ${config.name || '文檔爬取結果'}

> 來源網站: ${config.url}
> 爬取時間: ${new Date().toLocaleString('zh-TW')}
> 頁面數量: ${pageCount}
> 工具: Doc Scraper v1.0.0

---

`;
}

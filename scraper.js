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
  .version('2.0.0');

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
  .option('-f, --format <format>', '輸出格式: md, csv, anki, all', 'md')
  .option('--content-selector <selector>', '覆蓋內容選擇器')
  .option('--link-selector <selector>', '覆蓋連結選擇器')
  .option('--wait <ms>', '頁面等待時間 (毫秒)', parseInt)
  .option('--timeout <ms>', '頁面超時時間 (毫秒)', parseInt)
  .option('--max-pages <n>', '最大爬取頁數', parseInt)
  .option('--headless', '無頭模式 (預設)', true)
  .option('--no-headless', '顯示瀏覽器視窗')
  .option('--qa', '生成 Q&A 問答對（需要內容足夠豐富）')
  .option('--summary', '生成章節摘要')
  .action(async (presetName, options) => {
    await runScraper(presetName, options);
  });

program
  .command('quick <url>')
  .description('快速爬取指定 URL（自動偵測網站類型）')
  .option('-o, --output <dir>', '輸出目錄', './output')
  .option('-f, --format <format>', '輸出格式: md, csv, anki, all', 'md')
  .action(async (url, options) => {
    await runScraper('custom', { ...options, url });
  });

program
  .command('convert <input>')
  .description('將已爬取的 Markdown 轉換為其他格式')
  .option('-f, --format <format>', '輸出格式: csv, anki', 'csv')
  .option('-o, --output <file>', '輸出檔案路徑')
  .action(async (input, options) => {
    await convertFormat(input, options);
  });

// 儲存爬取的資料供後續處理
let scrapedData = [];

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
    format: options.format || 'md',
    contentSelector: options.contentSelector || preset.contentSelector,
    linkSelector: options.linkSelector || preset.linkSelector,
    waitTime: options.wait || preset.waitTime,
    timeout: options.timeout || preset.timeout,
    maxPages: options.maxPages || Infinity,
    headless: options.headless,
    generateQA: options.qa || false,
    generateSummary: options.summary || false
  };

  if (!config.url) {
    console.error(chalk.red('\n❌ 請提供網站 URL'));
    console.log(chalk.gray('使用 --url <url> 指定網站\n'));
    process.exit(1);
  }

  console.log(chalk.cyan('\n🚀 Doc Scraper v2.0 - 文檔爬蟲工具\n'));
  console.log(chalk.gray('配置:'));
  console.log(chalk.gray(`  預設: ${preset.name}`));
  console.log(chalk.gray(`  網站: ${config.url}`));
  console.log(chalk.gray(`  輸出: ${config.outputDir}`));
  console.log(chalk.gray(`  格式: ${config.format}`));
  console.log(chalk.gray(`  等待: ${config.waitTime}ms`));
  if (config.generateQA) console.log(chalk.gray(`  Q&A: 啟用`));
  if (config.generateSummary) console.log(chalk.gray(`  摘要: 啟用`));
  console.log('');

  // 建立輸出目錄
  const contentDir = path.join(config.outputDir, 'content');
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }

  const spinner = ora('啟動瀏覽器...').start();
  scrapedData = []; // 重置資料

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
          let el = document.querySelector(cfg.contentSelector);

          if (!el && cfg.fallbackSelectors) {
            for (const selector of cfg.fallbackSelectors) {
              el = document.querySelector(selector);
              if (el) break;
            }
          }

          if (!el) return '';

          const clone = el.cloneNode(true);
          clone.querySelectorAll('script, style, nav, .sidebar, .toc').forEach(e => e.remove());

          return clone.innerText.trim();
        }, config);

        if (content && content.length > 50) {
          // 儲存到資料陣列
          const pageData = {
            index: i + 1,
            title: link.text,
            url: link.href,
            content: content,
            keyPoints: extractKeyPoints(content),
            qa: config.generateQA ? generateQAPairs(link.text, content) : []
          };
          scrapedData.push(pageData);

          // 儲存個別 Markdown 檔案
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

      await sleep(300);
    }

    await browser.close();

    // Step 3: 輸出各種格式
    const outputs = [];

    // Markdown 輸出
    if (config.format === 'md' || config.format === 'all') {
      const combinedPath = path.join(config.outputDir, config.combinedFile);
      fs.writeFileSync(combinedPath, allContent, 'utf-8');
      outputs.push({ type: 'Markdown', path: combinedPath });
    }

    // CSV 輸出
    if (config.format === 'csv' || config.format === 'all') {
      const csvPath = path.join(config.outputDir, 'content.csv');
      const csvContent = generateCSV(scrapedData);
      fs.writeFileSync(csvPath, csvContent, 'utf-8');
      outputs.push({ type: 'CSV', path: csvPath });
    }

    // Anki 輸出
    if (config.format === 'anki' || config.format === 'all') {
      const ankiPath = path.join(config.outputDir, 'anki-import.txt');
      const ankiContent = generateAnkiFormat(scrapedData);
      fs.writeFileSync(ankiPath, ankiContent, 'utf-8');
      outputs.push({ type: 'Anki', path: ankiPath });
    }

    // Q&A CSV 輸出
    if (config.generateQA) {
      const qaPath = path.join(config.outputDir, 'qa-pairs.csv');
      const qaContent = generateQACSV(scrapedData);
      fs.writeFileSync(qaPath, qaContent, 'utf-8');
      outputs.push({ type: 'Q&A CSV', path: qaPath });
    }

    // JSON 資料輸出（供後續處理）
    const jsonPath = path.join(config.outputDir, 'data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(scrapedData, null, 2), 'utf-8');
    outputs.push({ type: 'JSON', path: jsonPath });

    // 輸出結果
    console.log('');
    console.log(chalk.cyan('═'.repeat(50)));
    console.log(chalk.green('\n✅ 爬取完成!\n'));
    console.log(chalk.gray('統計:'));
    console.log(chalk.gray(`  成功: ${chalk.green(successCount)} 頁`));
    console.log(chalk.gray(`  失敗: ${chalk.red(failCount)} 頁`));
    console.log('');
    console.log(chalk.gray('輸出檔案:'));
    outputs.forEach(o => {
      console.log(chalk.yellow(`  📄 ${o.type}: ${o.path}`));
    });
    console.log(chalk.yellow(`  📁 個別章節: ${contentDir}/`));
    console.log('');
    console.log(chalk.cyan('下一步:'));
    console.log(chalk.gray('  • 匯入 NotebookLM: https://notebooklm.google.com'));
    console.log(chalk.gray('  • 匯入 Anki: 使用 anki-import.txt'));
    console.log(chalk.gray('  • 查看 Q&A: 開啟 qa-pairs.csv\n'));

  } catch (error) {
    spinner.fail(`爬取失敗: ${error.message}`);
    process.exit(1);
  }
}

// 轉換格式指令
async function convertFormat(inputPath, options) {
  const spinner = ora('讀取檔案...').start();

  try {
    const content = fs.readFileSync(inputPath, 'utf-8');
    const outputPath = options.output || inputPath.replace(/\.[^.]+$/, `.${options.format}`);

    let output;
    if (options.format === 'csv') {
      output = markdownToCSV(content);
    } else if (options.format === 'anki') {
      output = markdownToAnki(content);
    } else {
      throw new Error(`不支援的格式: ${options.format}`);
    }

    fs.writeFileSync(outputPath, output, 'utf-8');
    spinner.succeed(`轉換完成: ${outputPath}`);
  } catch (error) {
    spinner.fail(`轉換失敗: ${error.message}`);
    process.exit(1);
  }
}

// ============ 工具函數 ============

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
> 工具: Doc Scraper v2.0.0

---

`;
}

// 從內容中提取關鍵要點
function extractKeyPoints(content) {
  const lines = content.split('\n').filter(l => l.trim());
  const keyPoints = [];

  for (const line of lines) {
    // 提取標題和重點
    if (line.match(/^#{1,3}\s/) ||
        line.match(/^\d+\.\s/) ||
        line.match(/^[-*]\s/) ||
        line.includes('：') && line.length < 100) {
      keyPoints.push(line.trim().replace(/^[#\-*\d.]+\s*/, ''));
    }
  }

  return keyPoints.slice(0, 10); // 最多 10 個要點
}

// 生成 Q&A 問答對
function generateQAPairs(title, content) {
  const qa = [];
  const sentences = content.split(/[。！？\n]/).filter(s => s.trim().length > 20);

  // 基於標題生成問題
  qa.push({
    question: `什麼是 ${title}？`,
    answer: sentences[0] || content.substring(0, 200)
  });

  // 基於內容關鍵詞生成問題
  const keywords = ['如何', '為什麼', '什麼是', '特點', '優點', '步驟', '方法'];
  for (const sentence of sentences.slice(0, 5)) {
    for (const kw of keywords) {
      if (sentence.includes(kw)) {
        qa.push({
          question: `關於「${title}」，${sentence.substring(0, 30)}...？`,
          answer: sentence
        });
        break;
      }
    }
  }

  return qa.slice(0, 5); // 每頁最多 5 個 Q&A
}

// 生成 CSV 格式
function generateCSV(data) {
  const header = 'Index,Title,URL,Content_Length,Key_Points\n';
  const rows = data.map(d => {
    const keyPoints = d.keyPoints.join('; ').replace(/"/g, '""');
    const title = d.title.replace(/"/g, '""');
    return `${d.index},"${title}","${d.url}",${d.content.length},"${keyPoints}"`;
  });
  return header + rows.join('\n');
}

// 生成 Q&A CSV 格式
function generateQACSV(data) {
  const header = 'Chapter,Question,Answer,Context_URL\n';
  const rows = [];

  for (const page of data) {
    for (const qa of page.qa) {
      const question = qa.question.replace(/"/g, '""');
      const answer = qa.answer.replace(/"/g, '""').substring(0, 500);
      const title = page.title.replace(/"/g, '""');
      rows.push(`"${title}","${question}","${answer}","${page.url}"`);
    }
  }

  return header + rows.join('\n');
}

// 生成 Anki 匯入格式 (Tab-separated)
function generateAnkiFormat(data) {
  const lines = [];
  lines.push('# Anki Import File');
  lines.push('# Format: Question<TAB>Answer<TAB>Tags');
  lines.push('# Import as: Basic (and reversed card)');
  lines.push('');

  for (const page of data) {
    const tag = sanitizeFilename(page.title).substring(0, 30);

    // 基於標題的卡片
    const frontTitle = `什麼是「${page.title}」？`;
    const backTitle = page.keyPoints.slice(0, 3).join('\n• ') || page.content.substring(0, 300);
    lines.push(`${frontTitle}\t${backTitle}\t${tag}`);

    // 基於 Q&A 的卡片
    for (const qa of page.qa) {
      const front = qa.question;
      const back = qa.answer.substring(0, 300);
      lines.push(`${front}\t${back}\t${tag}`);
    }
  }

  return lines.join('\n');
}

// Markdown 轉 CSV
function markdownToCSV(markdown) {
  const sections = markdown.split(/^## /m).filter(s => s.trim());
  const header = 'Section,Content_Preview,Word_Count\n';
  const rows = sections.map((s, i) => {
    const lines = s.split('\n');
    const title = lines[0] || `Section ${i + 1}`;
    const content = lines.slice(1).join(' ').substring(0, 200).replace(/"/g, '""');
    const wordCount = s.length;
    return `"${title.replace(/"/g, '""')}","${content}",${wordCount}`;
  });
  return header + rows.join('\n');
}

// Markdown 轉 Anki
function markdownToAnki(markdown) {
  const sections = markdown.split(/^## /m).filter(s => s.trim());
  const lines = ['# Anki Import File', ''];

  for (const section of sections) {
    const sectionLines = section.split('\n');
    const title = sectionLines[0] || 'Unknown';
    const content = sectionLines.slice(1).join(' ').substring(0, 300);

    if (title && content.length > 50) {
      const question = `什麼是「${title.trim()}」？`;
      const answer = content.replace(/\t/g, ' ').trim();
      const tag = sanitizeFilename(title).substring(0, 20);
      lines.push(`${question}\t${answer}\t${tag}`);
    }
  }

  return lines.join('\n');
}

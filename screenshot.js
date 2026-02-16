const puppeteer = require('puppeteer');
const path = require('path');

async function takeScreenshots() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });

  // Wait a bit for any animations to complete after page load
  page.setDefaultTimeout(10000);

  // Navigate to dashboard
  console.log('Navigating to dashboard...');
  await page.goto('http://localhost:3200', { waitUntil: 'networkidle2' });

  // Wait for the page to fully render
  await new Promise(r => setTimeout(r, 2000));

  // Take screenshot of Cyberpunk theme (default)
  console.log('Taking Cyberpunk theme screenshot...');
  await page.screenshot({
    path: path.join(__dirname, 'public', 'screenshots', 'cyberpunk-theme.png'),
    fullPage: false
  });

  // Switch to Moltbook theme
  console.log('Switching to Moltbook theme...');
  await page.evaluate(() => {
    // Find and click the Moltbook theme option
    const moltbookOption = document.querySelector('[data-theme="moltbook"]');
    if (moltbookOption) {
      moltbookOption.click();
    }
  });

  // Wait for theme to apply
  await new Promise(r => setTimeout(r, 1500));

  // Take screenshot of Moltbook theme
  console.log('Taking Moltbook theme screenshot...');
  await page.screenshot({
    path: path.join(__dirname, 'public', 'screenshots', 'moltbook-theme.png'),
    fullPage: false
  });

  // Optional: Take a screenshot with the dropdown open
  console.log('Taking theme dropdown screenshot...');
  await page.evaluate(() => {
    // Click the theme selector to open dropdown
    const themeSelector = document.getElementById('theme-selector');
    if (themeSelector) {
      themeSelector.click();
    }
  });
  await new Promise(r => setTimeout(r, 500));

  await page.screenshot({
    path: path.join(__dirname, 'public', 'screenshots', 'theme-dropdown.png'),
    fullPage: false
  });

  await browser.close();
  console.log('Screenshots saved successfully!');
}

takeScreenshots().catch(console.error);

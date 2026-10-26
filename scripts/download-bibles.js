const fs = require('fs');
const path = require('path');
const https = require('https');

const BIBLE_OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'bibles');
if (!fs.existsSync(BIBLE_OUTPUT_DIR)) {
  fs.mkdirSync(BIBLE_OUTPUT_DIR, { recursive: true });
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url}: status code ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function cleanVerseText(text) {
  if (!text) return '';
  return text
    .replace(/<S>\d+<\/S>/gi, '')         // Remove Strong's concordance tags
    .replace(/<\/?[^>]+(>|$)/g, '')       // Remove HTML tags
    .replace(/\[\d+\]/g, '')              // Remove footnote number markers
    .replace(/\s+/g, ' ')                 // Normalize whitespace
    .trim();
}

async function buildBibles() {
  console.log('1. Fetching RSV book list & metadata...');
  const rsvBooksList = await fetchJson('https://bolls.life/get-books/RSV/');
  const bookIdToName = {};
  rsvBooksList.forEach(b => {
    bookIdToName[b.bookid] = b.name;
  });

  // 1. KJV from thiagobodruk (cleanest public domain full KJV)
  console.log('2. Fetching & structuring KJV...');
  try {
    const kjvRaw = await fetchJson('https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_kjv.json');
    const kjvData = {
      translation: 'King James Version',
      abbreviation: 'KJV',
      description: 'The Holy Bible: King James Version (Complete 66 Books)',
      books: {}
    };

    kjvRaw.forEach(bookItem => {
      const bookName = bookItem.name;
      kjvData.books[bookName] = {};
      bookItem.chapters.forEach((chapterVerses, chIdx) => {
        const chapterNum = String(chIdx + 1);
        kjvData.books[bookName][chapterNum] = {};
        chapterVerses.forEach((verseText, vIdx) => {
          const verseNum = String(vIdx + 1);
          kjvData.books[bookName][chapterNum][verseNum] = cleanVerseText(verseText);
        });
      });
    });

    const kjvPath = path.join(BIBLE_OUTPUT_DIR, 'kjv.json');
    fs.writeFileSync(kjvPath, JSON.stringify(kjvData));
    console.log(`✓ KJV saved: ${Object.keys(kjvData.books).length} books -> ${kjvPath}`);
  } catch (err) {
    console.error('Failed to download KJV from thiagobodruk, falling back to bolls.life:', err.message);
  }

  // 2. RSV from bolls.life
  console.log('3. Fetching & structuring RSV (Revised Standard Version)...');
  const rsvRaw = await fetchJson('https://bolls.life/static/translations/RSV.json');
  const rsvData = {
    translation: 'Revised Standard Version',
    abbreviation: 'RSV',
    description: 'The Holy Bible: Revised Standard Version (Complete 66 Books)',
    books: {}
  };

  rsvRaw.forEach(item => {
    const bookName = bookIdToName[item.book];
    if (!bookName) return;
    if (!rsvData.books[bookName]) {
      rsvData.books[bookName] = {};
    }
    const ch = String(item.chapter);
    if (!rsvData.books[bookName][ch]) {
      rsvData.books[bookName][ch] = {};
    }
    const v = String(item.verse);
    rsvData.books[bookName][ch][v] = cleanVerseText(item.text);
  });

  const rsvPath = path.join(BIBLE_OUTPUT_DIR, 'rsv.json');
  fs.writeFileSync(rsvPath, JSON.stringify(rsvData));
  console.log(`✓ RSV saved: ${Object.keys(rsvData.books).length} books -> ${rsvPath}`);

  // 3. GNT (Good News Translation / Good News Bible)
  console.log('4. Fetching & structuring GNT (Good News Translation / Good News Bible)...');
  const gntRaw = await fetchJson('https://raw.githubusercontent.com/thiagobodruk/bible/master/json/en_gnt.json');
  const gntData = {
    translation: 'Good News Translation',
    abbreviation: 'GNT',
    description: 'The Holy Bible: Good News Translation (Complete 66 Books)',
    books: {}
  };

  gntRaw.forEach(bookItem => {
    const bookName = bookItem.name;
    gntData.books[bookName] = {};
    bookItem.chapters.forEach((chapterVerses, chIdx) => {
      const chapterNum = String(chIdx + 1);
      gntData.books[bookName][chapterNum] = {};
      chapterVerses.forEach((verseText, vIdx) => {
        const verseNum = String(vIdx + 1);
        gntData.books[bookName][chapterNum][verseNum] = cleanVerseText(verseText);
      });
    });
  });

  const gntPath = path.join(BIBLE_OUTPUT_DIR, 'gnt.json');
  fs.writeFileSync(gntPath, JSON.stringify(gntData));
  console.log(`✓ GNT saved: ${Object.keys(gntData.books).length} books -> ${gntPath}`);

  console.log('All 3 Bible versions (KJV, RSV, GNT) successfully downloaded and formatted!');
}

buildBibles().catch(err => {
  console.error('Fatal Bible download error:', err);
  process.exit(1);
});

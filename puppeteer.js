const puppeteer = require('puppeteer');
const fs = require('fs');
const { exit } = require('process');

const TIMEOUT = 200;

function timeout(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function getUrls(hrefElements) {
	const promises = hrefElements.map(async element => {
		const hrefObject = await element.getProperty('href');
		const url = hrefObject._remoteObject.value;
		return url;
	});

	const urls = await Promise.all(promises);
	return urls; 
}

(async() => {
	try {
		if (!fs.existsSync('./themes')) fs.mkdirSync('./themes');

		const files = fs.readdirSync('./themes');
		const done = new Set(files.map(f => f.split('.')[0]))

		const browser = await puppeteer.launch({ headless: true });
		const page = await browser.newPage();
		await page.goto('https://shop.lego.com/en-US/category/themes', 
						{ waitUntil: 'networkidle2' });

		const themeElements = await page.$x("//a[contains(text(), 'Shop Products')]");
		const themeUrls = await getUrls(themeElements);
		console.log(`Found ${themeUrls.length} themes.`);

		for (let themeUrl of themeUrls) {
			themeUrl = themeUrl.replace('/about', '');

			const split = themeUrl.split("/");
			const theme = split[split.length - 1];

			if (done.has(theme)) {
				console.log(`Theme ${theme} is already done.`)
				continue;
			}

			const output = [];

			console.log(`Visting theme: ${themeUrl}.`);
			await page.goto(themeUrl, { waitUntil: 'networkidle2' });

			const pages = await page.$x("//a[contains(@data-test, 'pagination-page')]");

			const paginatedUrls = pages.length ?
				[...new Array(pages.length)].map((_, idx) => {
					const pageNum = idx + 1;
					return `${themeUrl}?page=${pageNum}`;
				})
				: 
				[themeUrl];

			console.log(paginatedUrls);

			for (let pageUrl of paginatedUrls) {
				await page.goto(pageUrl, { waitUntil: 'networkidle2' });

				const productElements = await page.$x("//a[contains(@data-test, 'product-leaf-title-link')]");
				const productUrls = await getUrls(productElements);
				console.log(`This page has ${productUrls.length} products.`);

				const productPage = await browser.newPage();
				for (productUrl of productUrls) {
					await productPage.goto(productUrl, { waitUntil: 'networkidle2' });

					const features = await productPage.$x("//div[contains(@class, 'LayoutSectionstyles__LayoutExternal')]");
					const description = features[0] ? await features[0].evaluate(elem => elem.innerText) : undefined;
					
					// To get all html content
					// const html = await productPage.content(); 

					output.push({
						theme,
						themeUrl,
						productUrl,
						description,
					});

					await timeout(TIMEOUT);
				}
				await productPage.close();	
			}

			const json = JSON.stringify(output);
			fs.writeFileSync(`./themes/${theme}.json`, json, 'utf8', (error) => {
				if (error) {
					console.log(`Error writing file ${theme}.`);
 				} else {
					console.log(`${theme} file written successfully!`);
				}
			});
		}

		await browser.close();

	} catch (error) {
		console.log(error);
		exit(1);
	}
})();

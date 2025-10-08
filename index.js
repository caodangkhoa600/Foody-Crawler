import crawler from "./modules/crawl.js";
import foody from "./modules/visit.js";
import fs from "fs"
import 'dotenv/config'

async function main() {
    await foody.visit()
    await foody.login()
    const { cities } = await crawler.getMetadata()
    await fs.writeFileSync('./data/cities.json', JSON.stringify(cities, null, 2))

    crawler.getRestaurantByDistrict(cities)
}

main()
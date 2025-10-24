import client from "./httpClient.js"
import _ from "lodash"
import fs from "fs-extra"
import path from "path"
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const getMetadata = async function () {
    let config = {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
            'x-foody-api-version': 1,
            'x-foody-app-type': 1004,
            'x-foody-client-id': '',
            'x-foody-client-language': "vi",
            'x-foody-client-type': 1,
            'x-foody-client-version': "3.0.0"
        }
    }
    const metadata = await client.get('https://gappapi.deliverynow.vn/api/meta/get_metadata', config)
    const cityData = metadata.data.reply.country.cities;
    const cities = _.map(cityData, data => {
        const pickedCity = _.pick(data, ['id', 'name', 'longitude', 'latitude', 'url_rewrite_name']);
        pickedCity.districts = _.map(data.districts, district =>
            _.pick(district, ['province_id', 'name', 'url_rewrite_name', 'district_id'])
        );
        return pickedCity;
    });
    return { cities }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function appendToJsonFile(fileName, newData) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const dirPath = path.join(__dirname, '../data/restaurant');
    const filePath = path.join(dirPath, fileName);
    fs.ensureDirSync(dirPath);

    newData.forEach(e => {
        fs.appendFileSync(filePath, `${JSON.stringify(e)}\n`);
    })

    console.log(`Saved ${newData.length} items -> ${filePath}`);
}

async function fetchAllCities(cities) {
    const MAX_RETRIES = 5;

    for (const city of cities) {
        if (city.id != 218 && city.id != 217) {
            continue;
        }
        for (const district of city.districts) {
            let page = 1;
            const queried = new Set()
            while (true) {
                console.log('current page: ', page)
                const url = `https://www.foody.vn/${city.url_rewrite_name}/dia-diem?ds=Restaurant&vt=row&st=1&page=${page}&provinceId=${city.id}&categoryId=&append=true&dt=${district.district_id}`;
                // const url = `https://www.foody.vn/__get/Place/HomeListPlace?page=${page}&lat=${city.latitude}&lon=${city.longitude}&count=500&districtId=${district.district_id}&cateId=&cuisineId=&isReputation=&type=1&cityId=${city.id}`;

                const config = {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
                        'x-requested-with': 'XMLHttpRequest',
                    }
                };

                let attempt = 0;
                let response;

                while (attempt < MAX_RETRIES) {
                    try {
                        response = await client.get(url, config);
                        if (response.status >= 200 && response.status < 300) {
                            const data = response.data;
                            if (!data.searchItems) {
                                throw new Error(`HTTP ${response.status}`);
                            }
                            break;
                        } else {
                            throw new Error(`HTTP ${response.status}`);
                        }
                    } catch (err) {
                        attempt++;
                        console.warn(`Retry ${attempt}/${MAX_RETRIES} for ${district.name} page ${page}: ${err.message}`);
                        if (attempt >= MAX_RETRIES) {
                            console.error(`Failed after ${MAX_RETRIES} attempts: ${url}`);
                            return;
                        }
                        await sleep(2000 * attempt); // exponential backoff
                    }
                }

                const data = response.data;

                if (!data.searchItems || data.searchItems.length === 0) {
                    console.log(`done ${district.name}`);
                    break;
                }

                const dataResult = []

                data.searchItems.forEach(e => {
                    if (!queried.has(e.Id)) {
                        dataResult.push(e)
                        queried.add(e.Id)
                    }
                })

                if (dataResult.length === 0) {
                    console.log(`empty query, done ${district.name}`)
                    break;
                }

                await appendToJsonFile(`${city.id}_${district.district_id}.json`, dataResult);
                await sleep(3000);
                page++;
            }
        }
    }
}
export default {
    getMetadata: getMetadata,
    getRestaurantByDistrict: fetchAllCities
}
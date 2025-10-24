import fs from 'fs-extra';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import _ from 'lodash'

import client from './httpClient.js';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function GetRestaurantExtraData(detailUrl) {
    const result = {};

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

    let formatedDetailUrl = detailUrl;
    if (!formatedDetailUrl) {
        return result;
    }
    if (formatedDetailUrl.startsWith('/')) {
        formatedDetailUrl = formatedDetailUrl.slice(1);
    }
    try {
        const infoUrl = `https://gappapi.deliverynow.vn/api/delivery/get_from_url?url=${formatedDetailUrl}`
        const info = await client.get(infoUrl, config);

        const deliveryId = info.data.reply.delivery_id;

        const resDetailUrl = `https://gappapi.deliverynow.vn/api/delivery/get_detail?id_type=2&request_id=${deliveryId}`
        const resDetail = await client.get(resDetailUrl, config);

        const deliveryDetail = resDetail.data.reply.delivery_detail;
        result.availableTimes = deliveryDetail.delivery.time.week_days;

        const dishDetailUrl = `https://gappapi.deliverynow.vn/api/dish/get_delivery_dishes?id_type=2&request_id=${deliveryId}`
        const dishDetail = await client.get(dishDetailUrl, config);
        const menuInfos = dishDetail.data.reply.menu_infos;

        result.foods = menuInfos.map(menuInfo => ({
            ..._.pick(menuInfo, ['dish_type_id', 'dish_type_name']),
            dishes: menuInfo.dishes?.map(dish => {
                const rawPhoto = dish.photos?.[0].value;
                const cleanPhoto = rawPhoto ? rawPhoto.replace(/@.*/, '') : undefined; // remove from @ to the end

                return {
                    id: dish.id,
                    name: dish.name,
                    description: dish.description,
                    price: dish.price,
                    photo: cleanPhoto,
                };
            }) || [],
        }));

    } catch (e) {
        console.log(formatedDetailUrl);
    }

    await sleep(2000);
    return result
}

async function postInChunks(result) {
    for (let i = 0; i < result.length; i++) {
        const chunk = [result[i]]; // wrap single item in array
        await client.post('https://www.cidikay.info.vn/restaurant/single', chunk);
    }
}

async function handleFile(directoryPath, file) {
    const filePath = path.join(directoryPath, file);
    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        const result = [];

        if (!line.trim()) continue; // skip empty lines
        const data = JSON.parse(line);

        const restaurantModel = _.pick(data, [
            "Address", "District", "City", "Phone", "Cuisines", "TotalReview",
            "AvgRatingOriginal", "Latitude", "Longitude", "Categories", "Name",
            "Id", "PicturePath", "DetailUrl"
        ]);

        const resExtraData = await GetRestaurantExtraData(restaurantModel.DetailUrl)
        restaurantModel.availableTimes = resExtraData.availableTimes;
        restaurantModel.foods = resExtraData.foods;
        result.push(restaurantModel);

        let subItems = data.SubItems;
        if (subItems && subItems.length > 0) {
            for (let i = 0; i < subItems.length; i++) {
                const sub = _.pick(subItems[i], [
                    "Address", "District", "City", "Phone", "Cuisines", "TotalReview",
                    "AvgRatingOriginal", "Latitude", "Longitude", "Categories", "Name",
                    "Id", "PicturePath", "DetailUrl"
                ])

                const resExtraData = await GetRestaurantExtraData(sub.DetailUrl)
                sub.availableTimes = resExtraData.availableTimes;
                sub.foods = resExtraData.foods;

                result.push(sub);
            }
        }

        try {
            if (result.length > 0) {
                // const outFile = path.join(dirPath, 'processed', file);
                // await fs.ensureDir(dirPath);
                // await fs.writeFile(outFile, JSON.stringify(result, null, 2), 'utf-8');
                if (result.length > 3) {
                    await postInChunks(result)
                }
                else {
                    await client.post('https://www.cidikay.info.vn/restaurant/single', result, {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    })
                }
                console.log(`Processed: ${result.length}`);
            }
        } catch (err) {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);
            const dirPath = path.join(__dirname, '../data', 'processed');

            console.error(`Failed to process line: ${data.Id || 'unknown'} — ${err.message}`);
            await appendToJsonFile(file, result)
        }
    }
}

async function appendToJsonFile(fileName, newData) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    const dirPath = path.join(__dirname, '../data/', 'processed');
    const filePath = path.join(dirPath, fileName);
    fs.ensureDirSync(dirPath);
    for (let i = 0; i < newData.length; i++) {
        await fs.appendFileSync(filePath, `${JSON.stringify(newData[i])}\n`);
    }

    console.log(`Saved ${newData.length} items -> ${filePath}`);
}


async function processFiles() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const dirPath = path.join(__dirname, '../data');
    const directoryPath = path.join(dirPath, './restaurant1');

    const files = await fs.readdir(directoryPath);

    for (const file of files) {
        handleFile(directoryPath, file)
    }

    console.log('🎉 All files processed.');

    return 0;
}

export default processFiles;
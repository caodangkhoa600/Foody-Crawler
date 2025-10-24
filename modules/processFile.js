import fs from 'fs-extra';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import _ from 'lodash'

import client from './httpClient.js';

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

    if (formatedDetailUrl.startsWith('/')) {
        formatedDetailUrl = formatedDetailUrl.slice(1);
    }

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

    return result;
}

async function processFiles() {
    let count = 0;
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const dirPath = path.join(__dirname, '../data');
    const directoryPath = path.join(dirPath, './restaurant');

    const files = await fs.readdir(directoryPath);

    for (const file of files) {
        const filePath = path.join(directoryPath, file);
        const fileStream = fs.createReadStream(filePath);

        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        const result = [];

        for await (const line of rl) {
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
        }

        if (result.length > 0) {
            count += result.length;
            const outFile = path.join(dirPath, 'processed', file);
            await fs.ensureDir(dirPath);
            await fs.writeFile(outFile, JSON.stringify(result, null, 2), 'utf-8');
            console.log(`Processed: ${file}`);
        }
    }

    console.log('🎉 All files processed.');

    return count;
}

export default processFiles;
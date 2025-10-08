import * as cheerio from 'cheerio';
import client from "./httpClient.js";

const visit = async () => {
    client.get('https://www.foody.vn/')
}

const login = async () => {
    try {
        let config = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
                'content-type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'
            }
        }

        const authRequestHtml = await client.get('https://id.foody.vn/account/login?returnUrl=https://www.foody.vn/')
        let $ = cheerio.load(authRequestHtml.data)
        const token = $('input[name="__RequestVerificationToken"]').val()

        const params = new URLSearchParams();
        params.append('Email', process.env.FOODY_EMAIL);
        params.append('Password', process.env.FOODY_PASSWORD);
        params.append('RememberMe', 'true');
        params.append('__RequestVerificationToken', token);

        const response = await client.post('https://id.foody.vn/dang-nhap', params, config)
        $ = cheerio.load(response.data)
        const img = $('img')[0]
        const src = img.attributes.filter(e => e.name === 'src')[0].value

        await client.get(src)
    } catch (e) {

    }
}

export default {
    visit: visit,
    login: login
};
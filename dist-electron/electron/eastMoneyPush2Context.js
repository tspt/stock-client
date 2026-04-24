const DATA_EASTMONEY_ORIGIN = 'https://data.eastmoney.com';
const QUOTE_EASTMONEY_ORIGIN = 'https://quote.eastmoney.com';
/**
 * 与无痕下真实页面抓包一致：带 cb 的 clist 多为 <script> JSONP，Referer 常为 quote 站板块页（如 /bk/90.BK1037.html）。
 * clist/ulist 会校验 Referer/Origin 是否与站点、请求类型（script vs XHR）一致。
 */
export function deriveEastmoneyRefererOrigin(forwardUrl, fallbackReferer, fallbackOrigin) {
    try {
        const u = new URL(forwardUrl);
        const fs = u.searchParams.get('fs');
        if (fs) {
            const decoded = decodeURIComponent(fs);
            const bBlock = decoded.match(/\bb:?(BK\d+)\b/i);
            if (bBlock) {
                return {
                    referer: `${QUOTE_EASTMONEY_ORIGIN}/bk/90.${bBlock[1]}.html`,
                    origin: QUOTE_EASTMONEY_ORIGIN,
                };
            }
            if (decoded.includes('m:90') && decoded.includes('s:2')) {
                return {
                    referer: `${QUOTE_EASTMONEY_ORIGIN}/center/boardlist.html`,
                    origin: QUOTE_EASTMONEY_ORIGIN,
                };
            }
            if (decoded.includes('m:90') && decoded.includes('s:4')) {
                return {
                    referer: `${QUOTE_EASTMONEY_ORIGIN}/center/boardlist.html`,
                    origin: QUOTE_EASTMONEY_ORIGIN,
                };
            }
        }
    }
    catch {
        /* ignore */
    }
    return {
        referer: fallbackReferer || `${DATA_EASTMONEY_ORIGIN}/`,
        origin: fallbackOrigin || DATA_EASTMONEY_ORIGIN,
    };
}
export function isEastmoneyJsonpUrl(href) {
    try {
        return new URL(href).searchParams.has('cb');
    }
    catch {
        return false;
    }
}

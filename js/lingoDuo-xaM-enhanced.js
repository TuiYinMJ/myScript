/*
 * Duolingo Max 解锁 增强版
 *
 * 处理接口：
 *   /2023-05-23/config                     视频通话开关、广告开关
 *   /2023-05-23/batch                      用户数据（subscriberLevel / shopItems / 体力 / 能量 / 订阅）
 *   /2023-05-23/users/<id>                 用户数据（含 ?fields=subscriberLevel）
 *   /2023-05-23/users/<id>/available-features  会员权益列表
 *   /2023-05-23/messaging/get-messages     Super/Max 引导消息过滤
 *   /2023-05-23/users/<id>/subscription-catalog  透传（advertisableFeatures 即权益清单来源）
 *   /plus-promotions/*                     插屏视频广告 / 促销决策
 *   midas-bandits-prod/fetch_decisions    加载屏促销、家庭计划文案等 bandit 决策
 *
 * 会员伪装采用服务端真实存在的形态（抓包与原版脚本验证）：
 *   - subscriberLevel = 'GOLD'，shopItems 用 gold_subscription（24Q2Max 产品 = Max 档位）
 *   - Max 档位由 hasMax + trackingProperties.has_item_gold_subscription_plus 标记
 *   - 不使用虚构的 'MAX' / max_subscription / super_subscription（客户端不识别会回退免费）
 *
 * MAX_FEATURES 取自抓包里 subscription-catalog 的 advertisableFeatures：
 * ["NO_NETWORK_ADS","UNLIMITED_HEARTS","LEGENDARY_LEVEL","MISTAKES_INBOX","MASTERY_QUIZ",
 *  "NO_SUPER_PROMOS","LICENSED_SONGS","CHAT_TUTORS","EXPLAIN_MY_ANSWER",
 *  "VIDEO_CALL_IN_PATH","VIDEO_CALL_IN_PRACTICE_HUB"]
 */

const MAX_FEATURES = [
    "NO_NETWORK_ADS", "UNLIMITED_HEARTS", "LEGENDARY_LEVEL", "MISTAKES_INBOX",
    "MASTERY_QUIZ", "NO_SUPER_PROMOS", "LICENSED_SONGS", "CHAT_TUTORS",
    "EXPLAIN_MY_ANSWER", "VIDEO_CALL_IN_PATH", "VIDEO_CALL_IN_PRACTICE_HUB"
];

// 统一输出：删掉 Content-Length / Content-Encoding，避免 body 改写后变长被截断
const done = (obj) => {
    const bodyStr = JSON.stringify(obj);
    const raw = $response.headers;
    if (raw && Object.keys(raw).length) {
        const headers = Object.assign({}, raw);
        Object.keys(headers).forEach(k => {
            const lk = k.toLowerCase();
            if (lk === 'content-length' || lk === 'content-encoding') delete headers[k];
        });
        $done({ body: bodyStr, headers: headers });
    } else {
        $done({ body: bodyStr });
    }
};
const keep = () => $done({});

try {
    const url = $request.url;
    const now = Math.floor(Date.now() / 1000);
    const args = (typeof $argument !== 'undefined' && $argument) ? $argument : {};

    // ============ 0. bandit 促销决策 ============
    // 返回空数组，不再展示加载屏促销 / Super 家庭计划文案
    if (url.includes('/fetch_decisions')) {
        done([]);
        return;
    }

    // ============ 1. 插屏视频广告 / 促销决策 ============
    if (url.includes('/plus-promotions/')) {
        let o = JSON.parse($response.body);
        if (o.decisions) o.decisions = {};
        if (Array.isArray(o.promotions)) o.promotions = [];
        if (Array.isArray(o.treatedExperiments)) o.treatedExperiments = [];
        if (o.features) o.features = {};
        done(o);
        return;
    }

    // ============ 2. available-features：补全会员权益 ============
    // 免费版实际只返回 ["EXPLAIN_MY_ANSWER_FOR_ENERGY_COST"]
    if (url.includes('/available-features')) {
        let o = JSON.parse($response.body);
        o.subscriptionFeatures = MAX_FEATURES.slice();
        // purchasableFeatures 保持原样，避免破坏内购流程
        done(o);
        return;
    }

    // ============ 3. config：视频通话 + 广告开关 ============
    if (url.includes('/2023-05-23/config')) {
        let configBody = JSON.parse($response.body);

        if (configBody.featureFlags) {
            const ff = configBody.featureFlags;
            // 视频通话 tab 不被强制禁用（config 实际下发的两个真实 flag）
            ff.ios_video_call_tab_should_force_unavailable_state = false;
            ff.ios_video_call_public_testing_indicator_china = true;
            ff.ios_vc_sherpa_eligible_countries = "US,CN,SG,JP,KR,TW,HK,MO,BR,IN,MX,ID,AR,CO,PE,VE,CL,EC,BO,GT,PH,DO,PY,VN,CU,CR,SV,HN,UY,PR,PA,NI,HT,TH,MY,TL,FM,MP,AS,PW,PK,BD,RE,SX,AX,IO,BV,TK,UM,SH,NU,TF,HM,GS,PN,AG,CW,JE,VC,SJ,BS,GM,BA,CD,CG,CI,CZ,FK,KN,MK,MM,PM,ST,TC,TT,VI,SZ,BQ,NF,VA,AN,NG,RU,IR,TR,EG,KE,UA,ZA,SA,MA,DZ,IQ,TZ,AF,ET,UG,UZ,GH,KZ,SD,ML,AE,ZM,SN,AO,JO,SY,ZW,TN,AZ,NP,YE,CM,BY,MZ,RS,RW,LY,LB,BF,KW,OM,BJ,PS,NE,GE,KG,MD,QA,TJ,MG,LK,MW,GN,TD,AL,AM,SO,BH,XK,BI,JM,TM,GA,NA,BW,KH,SL,TG,MR,MU,SS,LR,LS,PG,CF,DJ,LA,ME,MN,GY,GQ,CV,SR,MQ,GW,ER,GP,FJ,BB,BT,BZ,KM,SB,LC,MV,BN,GF,PF,YT,AW,NC,AD,SC,GD,BM,VU,GG,KY,IM,GL,WS,DM,FO,GU,MC,LI,GI,KI,EH,TO,SM,KP,MF,VG,MH,AI,CK,BL,NR,TV,WF,MS,AQ,CX,CC";
            ff.ios_should_reduce_experiment_requests = 0.0;

            // 广告相关开关（仅在服务端确实下发该 flag 时改写）
            if ('ios_literacy_ad_rollout' in ff) ff.ios_literacy_ad_rollout = 0.0;
            if ('ios_allow_streak_ext_client_rendered_ads_prefetch' in ff) ff.ios_allow_streak_ext_client_rendered_ads_prefetch = false;
            if ('ios_ads_instream_custom_skip_offset_seconds' in ff) ff.ios_ads_instream_custom_skip_offset_seconds = 0;
            if ('ios_ads_instream_custom_skip_threshold_seconds' in ff) ff.ios_ads_instream_custom_skip_threshold_seconds = 0;
        }

        configBody.ipCountry = "US";
        if (configBody.countryCode !== undefined) configBody.countryCode = "US";
        done(configBody);
        return;
    }

    // ============ 4. messaging：过滤 Super/Max 引导消息 ============
    if (url.includes('/2023-05-23/messaging/get-messages')) {
        let msgBody = JSON.parse($response.body);
        if (msgBody.messageDisplayInfo && Array.isArray(msgBody.messageDisplayInfo)) {
            const blockList = [
                'promoCodeSuperOnboarding', 'promoCodeSuperOffboarding',
                'superFamilyPlanInvite', 'superFamilyPlanDirectAdd',
                'maxFamilyPlanUpgradeNudge', 'immersivePlusPromo',
                'familyPlanPromo', 'newYearsCrossgradeDiscount',
                'plusBottomSheetFamilyFollowUp', 'appOpenMaxCrossgradeDiscountHook',
                'maxIndividualToSuperFamilyMigration'
            ];
            msgBody.messageDisplayInfo = msgBody.messageDisplayInfo.filter(item => {
                const msgId = item.messageId;
                if (msgId) {
                    const key = Object.keys(msgId)[0];
                    return !blockList.includes(key);
                }
                return true;
            });
        }
        done(msgBody);
        return;
    }

    // ============ 5. subscription-catalog：透传 ============
    // 该接口不下发时会破坏购买流程，保持原样；MAX_FEATURES 即来自它的 advertisableFeatures
    if (url.includes('/subscription-catalog')) {
        keep();
        return;
    }

    // ============ 6. 用户数据 / batch ============
    // 只解析含用户数据的接口，跳过 sdui-shop(1.3MB) 等大响应
    const path = url.split('?')[0];
    const isBatch = path.endsWith('/2023-05-23/batch');
    const isUser = /\/2023-05-23\/users\/\d+$/.test(path);
    if (!isBatch && !isUser) {
        keep();
        return;
    }

    const obj = JSON.parse($response.body);

    const applyMax = (userdata) => {
        if (!userdata) return;

        // ---- 6.1 订阅层级伪装 ----
        // subscriberLevel 用 'GOLD'（原版脚本已验证可行）；Max 档位靠 hasMax +
        // gold_subscription(24Q2Max 产品) + has_item_gold_subscription_plus 共同标记。
        // 不再使用 'MAX' / max_subscription / super_subscription——这些 id 服务端
        // 从不下发，客户端校验失败会回退成免费用户，导致 Max 身份不生效。
        userdata.subscriberLevel = 'GOLD';
        userdata.hasPlus = true;
        userdata.hasMax = true;

        // ---- 6.2 shopItems：续期真实的 gold_subscription（Max 档位产品） ----
        if (!userdata.shopItems) userdata.shopItems = [];
        // 清理此前版本注入的虚构条目
        userdata.shopItems = userdata.shopItems.filter(item =>
            item.id !== 'max_subscription' && item.id !== 'super_subscription');

        let gold = userdata.shopItems.find(item => item.id === 'gold_subscription');
        if (gold) {
            // 已有（含已过期）：续期
            if (gold.subscriptionInfo) {
                gold.subscriptionInfo.expectedExpiration = now + 31536000;
                gold.subscriptionInfo.renewing = true;
            }
            gold.purchaseDate = (typeof gold.purchaseDate === 'number') ? gold.purchaseDate : now - 172800;
        } else {
            userdata.shopItems.push({
                id: 'gold_subscription',
                purchaseDate: now - 172800,
                purchasePrice: 0,
                subscriptionInfo: {
                    expectedExpiration: now + 31536000,
                    productId: "com.duolingo.DuolingoMobile.subscription.Gold.TwelveMonth.24Q2Max.168",
                    renewer: 'APPLE', renewing: true, tier: 'twelve_month', type: 'gold'
                }
            });
        }

        // ---- 6.3 trackingProperties 全开（含 Max 专属标记） ----
        if (!userdata.trackingProperties) userdata.trackingProperties = {};
        [
            "has_item_immersive_subscription", "has_item_premium_subscription",
            "has_item_live_subscription", "has_item_gold_subscription",
            "has_item_gold_subscription_plus", "has_item_max_subscription"
        ].forEach(p => userdata.trackingProperties[p] = true);
        userdata.trackingProperties.no_network_ads = true;
        userdata.trackingProperties.unlimited_hearts = true;

        // ---- 6.4 无限体力 / 无限能量 ----
        if (userdata.health) {
            userdata.health.unlimitedHeartsAvailable = true;
            userdata.health.useHealth = false;
            userdata.health.hearts = 999;
            userdata.health.maxHearts = 999;
            userdata.health.secondsPerHeartSegment = 0;
            userdata.health.secondsUntilNextHeartSegment = null;
        }
        if (userdata.energyConfig) {
            userdata.energyConfig.energy = 999;
            userdata.energyConfig.maxEnergy = 999;
            userdata.energyConfig.baseMaxEnergy = 999;
            userdata.energyConfig.secondsPerEnergyUnit = 0;
            userdata.energyConfig.secondsUntilNextEnergyUnit = 0;
        }

        // ---- 6.6 去广告 / 促销 ----
        if (userdata.adsConfig) {
            userdata.adsConfig.allowPersonalizedAds = false;
            userdata.adsConfig.units = {};
        }
        userdata.literacyAdGroup = null;
        userdata.adRequestAgeGroup = null;
        userdata.plusDiscounts = [];
        if (userdata.pushFamilyPlanNudge !== undefined) userdata.pushFamilyPlanNudge = false;
        if (userdata.pushPromotion !== undefined) userdata.pushPromotion = false;

        // ---- 6.7 订阅记录：续期真实条目（itemType 用服务端真实值 gold_subscription） ----
        if (Array.isArray(userdata.subscriptionConfigs) && userdata.subscriptionConfigs.length) {
            // 更新已有的（含已过期）订阅记录，保留服务端下发的真实字段
            userdata.subscriptionConfigs.forEach(cfg => {
                if (cfg.itemType === 'max_subscription' || cfg.itemType === 'super_subscription') {
                    cfg.itemType = 'gold_subscription';
                }
                cfg.expirationTimestamp = (now + 31536000) * 1000;
                cfg.isInBillingRetryPeriod = false;
                cfg.isInGracePeriod = false;
            });
        } else if (userdata.subscriptionConfigs !== undefined) {
            userdata.subscriptionConfigs = [{
                isInBillingRetryPeriod: false,
                isInGracePeriod: false,
                productId: "com.duolingo.DuolingoMobile.subscription.Gold.TwelveMonth.24Q2Max.168",
                expirationTimestamp: (now + 31536000) * 1000,
                isFreeTrialPeriod: false,
                itemType: 'gold_subscription'
            }];
        }

        // ---- 6.8 经验加倍（保留原有逻辑） ----
        if (args.xp_boost) {
            const xpMultiplier = parseInt(args.multiplier);
            if (!userdata.shopItems) userdata.shopItems = [];
            let foundXpBoost = false;
            for (let i = 0; i < userdata.shopItems.length; i++) {
                if (userdata.shopItems[i].id === 'xp_boost_stackable') {
                    userdata.shopItems[i].purchaseDate = now;
                    userdata.shopItems[i].expectedExpirationDate = now + 3600;
                    userdata.shopItems[i].xpBoostMultiplier = xpMultiplier;
                    foundXpBoost = true;
                    break;
                }
            }
            if (!foundXpBoost) {
                userdata.shopItems.push({
                    id: 'xp_boost_stackable',
                    purchaseDate: now,
                    expectedExpirationDate: now + 3600,
                    purchasePrice: 0,
                    xpBoostMultiplier: xpMultiplier
                });
            }
        }

        // ---- 6.9 解锁所有关卡（保留原有逻辑） ----
        if (args.unlock_all) {
            if (userdata.currentCourse && Array.isArray(userdata.currentCourse.pathSectioned)) {
                userdata.currentCourse.pathSectioned.forEach(section => {
                    if (Array.isArray(section.units)) {
                        section.units.forEach(unit => {
                            if (Array.isArray(unit.levels)) {
                                unit.levels.forEach(level => {
                                    if (level.state === 'locked') level.state = 'active';
                                });
                            }
                        });
                    }
                });
            }
        }
    };

    // batch：遍历 responses，只改真正的用户数据对象
    if (Array.isArray(obj.responses)) {
        let changed = false;
        obj.responses.forEach(r => {
            let b = r.body;
            if (typeof b === 'string') {
                try { b = JSON.parse(b); } catch (e) { return; }
            }
            if (b && typeof b === 'object' &&
                (b.subscriberLevel !== undefined || b.trackingProperties !== undefined)) {
                applyMax(b);
                r.body = JSON.stringify(b);
                changed = true;
                // 删除该子响应的 etag：否则 App 下次带 If-None-Match 请求，
                // 服务端 304 返回空 body，脚本无物可改，App 继续用缓存
                if (r.headers) {
                    delete r.headers.etag;
                    delete r.headers.Etag;
                    delete r.headers.ETag;
                }
            }
        });
        if (changed) { done(obj); return; }
        keep();
        return;
    }

    // 直接的用户数据对象（如 ?fields=subscriberLevel）
    if (obj && typeof obj === 'object' &&
        (obj.shopItems !== undefined || obj.subscriberLevel !== undefined ||
         (obj.id && obj.trackingProperties))) {
        applyMax(obj);
        done(obj);
        return;
    }

    keep();
} catch (e) {
    console.log('[Duolingo Max] 解析失败，原样返回: ' + e);
    $done({});
}

try {
    const url = $request.url;
    const now = Math.floor(Date.now() / 1000);
    const args = (typeof $argument !== 'undefined' && $argument) ? $argument : {};

    // ==================== 1. config 接口：强制开放视频通话 + 伪装区域 ====================
    if (url.includes('/2023-05-23/config')) {
        let configBody = JSON.parse($response.body);

        if (configBody.featureFlags) {
            // 视频通话 tab 不被强制禁用
            configBody.featureFlags.ios_video_call_tab_should_force_unavailable_state = false;
            // 中国区测试标识
            configBody.featureFlags.ios_video_call_public_testing_indicator_china = true;
            // 尝试开启视频通话 tab（部分版本可能用这个 key）
            configBody.featureFlags.ios_video_call_tab_enabled = true;
            // 扩展视频通话可用国家列表，确保包含 US/CN/SG 等
            configBody.featureFlags.ios_vc_sherpa_eligible_countries = "US,CN,SG,JP,KR,TW,HK,MO,BR,IN,MX,ID,AR,CO,PE,VE,CL,EC,BO,GT,PH,DO,PY,VN,CU,CR,SV,HN,UY,PR,PA,NI,HT,TH,MY,MO,TL,FM,MP,AS,PW,PK,BD,RE,SX,AX,IO,BV,TK,UM,SH,NU,TF,HM,GS,PN,AG,CW,JE,VC,SJ,BS,GM,BA,CD,CG,CI,CZ,FK,KN,MK,MM,PM,ST,TC,TT,VI,SZ,BQ,NF,VA,AN,NG,RU,IR,TR,EG,KE,UA,ZA,SA,MA,DZ,IQ,TZ,AF,ET,UG,UZ,GH,KZ,SD,ML,AE,ZM,SN,AO,JO,SY,ZW,TN,AZ,NP,YE,CM,BY,MZ,RS,RW,LY,LB,BF,KW,OM,BJ,PS,NE,GE,KG,MD,QA,TJ,MG,LK,MW,GN,TD,AL,AM,SO,BH,XK,BI,JM,TM,GA,NA,BW,KH,SL,TG,MR,MU,SS,LR,LS,PG,CF,DJ,LA,ME,MN,GY,GQ,CV,SR,MQ,GW,ER,GP,FJ,BB,BT,BZ,KM,SB,LC,MV,BN,GF,PF,YT,AW,NC,AD,SC,GD,BM,VU,GG,KY,IM,GL,WS,DM,FO,GU,MC,LI,GI,KI,EH,TO,SM,KP,MF,VG,MH,AI,CK,BL,NR,TV,WF,MS,AQ,CX,CC";
            // 减少实验请求，避免客户端频繁校验
            configBody.featureFlags.ios_should_reduce_experiment_requests = 0.0;
        }

        // 伪装区域为美国
        configBody.ipCountry = "US";
        if (configBody.countryCode !== undefined) configBody.countryCode = "US";

        $done({ body: JSON.stringify(configBody) });
        return;
    }

    // ==================== 2. messaging 接口：过滤 Super/Max 引导消息 ====================
    if (url.includes('/2023-05-23/messaging/get-messages')) {
        let msgBody = JSON.parse($response.body);
        if (msgBody.messageDisplayInfo && Array.isArray(msgBody.messageDisplayInfo)) {
            const blockList = [
                'promoCodeSuperOnboarding',
                'promoCodeSuperOffboarding',
                'superFamilyPlanInvite',
                'superFamilyPlanDirectAdd',
                'maxFamilyPlanUpgradeNudge',
                'immersivePlusPromo',
                'familyPlanPromo',
                'newYearsCrossgradeDiscount',
                'plusBottomSheetFamilyFollowUp',
                'appOpenMaxCrossgradeDiscountHook',
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
        $done({ body: JSON.stringify(msgBody) });
        return;
    }

    // ==================== 3. subscription-catalog 接口：透传（可选增强） ====================
    if (url.includes('/subscription-catalog')) {
        let catalogBody = JSON.parse($response.body);
        // 如果客户端用这个接口判断订阅，可以确保套餐列表包含 Max
        // 目前先原样返回，避免破坏购买流程
        $done({ body: JSON.stringify(catalogBody) });
        return;
    }

    // ==================== 4. 用户数据 / batch 接口：全面伪装 MAX 会员 ====================
    const obj = JSON.parse($response.body);

    const applyMax = (userdata) => {
        if (!userdata) return;

        // ---- 4.1 订阅层级全面伪装 ----
        userdata.subscriberLevel = 'MAX';
        userdata.hasPlus = true;
        userdata.has_plus = true;
        userdata.isPlus = true;
        userdata.isSuper = true;
        userdata.isMax = true;

        // ---- 4.2 shopItems 添加 max_subscription 和 super_subscription ----
        if (!userdata.shopItems) userdata.shopItems = [];

        // 移除旧的 gold_subscription，避免冲突
        userdata.shopItems = userdata.shopItems.filter(item => item.id !== 'gold_subscription');

        // 添加 max_subscription
        let hasMax = userdata.shopItems.some(item => item.id === 'max_subscription');
        if (!hasMax) {
            userdata.shopItems.push({
                id: 'max_subscription',
                purchaseDate: now - 172800,
                purchasePrice: 0,
                subscriptionInfo: {
                    expectedExpiration: now + 31536000,
                    productId: "com.duolingo.DuolingoMobile.subscription.Max.TwelveMonth.24Q2Max.168",
                    renewer: 'APPLE',
                    renewing: true,
                    tier: 'twelve_month',
                    type: 'max'
                }
            });
        }

        // 添加 super_subscription 作为后备（视频通话可能下放到 Super）
        let hasSuper = userdata.shopItems.some(item => item.id === 'super_subscription');
        if (!hasSuper) {
            userdata.shopItems.push({
                id: 'super_subscription',
                purchaseDate: now - 172800,
                purchasePrice: 0,
                subscriptionInfo: {
                    expectedExpiration: now + 31536000,
                    productId: "com.duolingo.DuolingoMobile.subscription.Super.TwelveMonth.24Q2Max.168",
                    renewer: 'APPLE',
                    renewing: true,
                    tier: 'twelve_month',
                    type: 'super'
                }
            });
        }

        // ---- 4.3 trackingProperties 全开 ----
        if (!userdata.trackingProperties) userdata.trackingProperties = {};
        [
            "has_item_immersive_subscription",
            "has_item_premium_subscription",
            "has_item_live_subscription",
            "has_item_gold_subscription",
            "has_item_max_subscription",
            "has_item_super_subscription",
            "has_item_plus_subscription"
        ].forEach(p => userdata.trackingProperties[p] = true);

        // ---- 4.4 subscription 对象增强 ----
        if (!userdata.subscription) userdata.subscription = {};
        userdata.subscription.level = 'MAX';
        userdata.subscription.type = 'max';
        userdata.subscription.isActive = true;

        // ---- 4.5 经验加倍（保留原有逻辑） ----
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

        // ---- 4.6 解锁所有关卡（保留原有逻辑） ----
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

    // 处理 batch 响应
    if (obj.responses && obj.responses.length >= 2) {
        if (obj.responses[0].headers && 'etag' in obj.responses[0].headers) {
            // 有 etag 表示未修改，跳过
            $done({});
        } else {
            const b0 = obj.responses[0].body;
            if (typeof b0 === 'string') {
                const userdata = JSON.parse(b0);
                applyMax(userdata);
                obj.responses[0].body = JSON.stringify(userdata);
            } else {
                applyMax(b0);
                obj.responses[0].body = b0;
            }
            $done({ body: JSON.stringify(obj) });
        }
    } else if (obj && typeof obj === 'object' &&
               (obj.shopItems !== undefined || obj.subscriberLevel !== undefined ||
                (obj.id && obj.trackingProperties))) {
        // 直接的用户数据对象
        applyMax(obj);
        $done({ body: JSON.stringify(obj) });
    } else {
        $done({});
    }
} catch (e) {
    $done({});
}
// =================================================================
// 1. 引入核心模块 (Import Core Modules)
// =================================================================
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { AlipaySdk } = require('alipay-sdk');
const axios = require('axios');

// =================================================================
// 2. 初始化服务 (Initialize Services)
// =================================================================

// 初始化 Firebase Admin SDK
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK initialized successfully.');
} catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error);
    process.exit(1);
}
const db = admin.firestore();

// 密钥格式化函数
const formatKey = (key) => {
    if (!key) return '';
    return key.replace(/\\n/g, '\n');
};

// 初始化 Alipay SDK
const alipaySdk = new AlipaySdk({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY),
    alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY),
    gateway: 'https://openapi.alipay.com/gateway.do',
    keyType: 'PKCS8',
});
console.log('✅ Alipay SDK initialized.');

// 初始化 Express 应用
const app = express();
const PORT = process.env.PORT || 3001;

// =================================================================
// 3. 中间件设置 (Middleware Setup)
// =================================================================
app.use(cors()); 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// =================================================================
// 4. API 路由定义 (API Routes)
// =================================================================

// --- **** NEW: Alipay Health Check Endpoint **** ---
app.get('/api/test-alipay', async (req, res) => {
    console.log('[Alipay Test] Starting Alipay connection test...');
    try {
        if (!alipaySdk) {
            throw new Error("Alipay SDK not initialized.");
        }
        console.log('[Alipay Test] Attempting to execute alipay.trade.query...');
        
        // We use a query API with a non-existent trade number.
        // We don't care about the result, only if the call itself succeeds or fails due to config/auth issues.
        const result = await alipaySdk.exec('alipay.trade.query', {
            bizContent: {
                out_trade_no: 'TEST_DO_NOT_PAY_' + Date.now(),
            },
        });

        console.log('[Alipay Test] Successfully received response from Alipay:', result);
        
        // A "Business Failed" (sub_code: ACQ.TRADE_NOT_EXIST) response is a SUCCESS for our test,
        // because it means our authentication and signing worked correctly.
        if (result.code === '10000' || (result.code === '40004' && result.subCode === 'ACQ.TRADE_NOT_EXIST')) {
            res.status(200).json({
                status: 'SUCCESS',
                message: '✅ 恭喜！后端与支付宝的连接和密钥配置完全正确！',
                alipayResponse: result
            });
        } else {
             throw new Error(`Alipay returned an unexpected error: ${result.subMsg || result.msg}`);
        }

    } catch (error) {
        console.error("[Alipay Test Error]", error);
        res.status(500).json({
            status: 'FAILURE',
            message: '❌ 后端与支付宝的连接测试失败。请检查Render上的环境变量，特别是ALIPAY_PRIVATE_KEY的格式。',
            errorDetails: error.message,
            rawError: error
        });
    }
});


// --- 用户认证路由 (Auth Routes) ---
// ... (Omitted for brevity, no changes)

// --- 支付路由 (Payment Routes) ---
// ... (Omitted for brevity, no changes)

// --- AI核心服务路由 (AI Core Routes) ---
// ... (Omitted for brevity, no changes)


// =================================================================
// 5. 启动服务器 (Start Server)
// =================================================================
app.listen(PORT, () => {
  console.log(`🚀 小鹅评语机后端服务已启动，监听端口: ${PORT}`);
});

// =================================================================
// 6. 辅助函数 (Helper Functions)
// =================================================================
// ... (Omitted for brevity, no changes)


// =================================================================
// 1. 引入核心模块 (Import Core Modules)
// =================================================================
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { AlipaySdk } = require('alipay-sdk');
const axios = require('axios');

// =================================================================
// 2. 环境变量自检 (Pre-flight Environment Checks)
// =================================================================
const requiredEnvVars = [
    'FIREBASE_SERVICE_ACCOUNT_KEY_JSON',
    'ALIPAY_APP_ID',
    'ALIPAY_PRIVATE_KEY',
    'ALIPAY_PUBLIC_KEY',
    'GEMINI_API_KEY',
    'DEEPSEEK_API_KEY'
];

// 密钥格式化函数
const formatKey = (key) => {
    if (!key) return '';
    // This regex replaces all occurrences of '\\n' with a real newline character
    return key.replace(/\\n/g, '\n');
};

let firebaseInitialized = false;
let alipayInitialized = false;

// 初始化 Firebase Admin SDK
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        const db = admin.firestore();
        firebaseInitialized = true;
        console.log('✅ Firebase Admin SDK initialized successfully.');
    } else {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY_JSON is not set.');
    }
} catch (error) {
    console.error('❌ Firebase Admin SDK initialization failed:', error.message);
}

// 初始化 Alipay SDK
try {
    if (process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY && process.env.ALIPAY_PUBLIC_KEY) {
        const alipaySdk = new AlipaySdk({
            appId: process.env.ALIPAY_APP_ID,
            privateKey: formatKey(process.env.ALIPAY_PRIVATE_KEY),
            alipayPublicKey: formatKey(process.env.ALIPAY_PUBLIC_KEY),
            gateway: 'https://openapi.alipay.com/gateway.do',
            keyType: 'PKCS8',
        });
        alipayInitialized = true;
        console.log('✅ Alipay SDK initialized.');
    } else {
        throw new Error('Alipay credentials are not fully set.');
    }
} catch (error) {
    console.error('❌ Alipay SDK initialization failed:', error.message);
}


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

// --- **** NEW: Health Check Endpoint **** ---
app.get('/api/health-check', (req, res) => {
    const healthReport = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            firebase: firebaseInitialized ? '✅ Initialized' : '❌ FAILED',
            alipay: alipayInitialized ? '✅ Initialized' : '❌ FAILED',
        },
        environmentVariables: requiredEnvVars.map(varName => ({
            variable: varName,
            status: process.env[varName] ? '✅ Set' : '❌ MISSING'
        }))
    };
    res.json(healthReport);
});


// --- 用户认证路由 (Auth Routes) ---
// ... (The rest of the routes remain the same, but they depend on the initializations above)
// ... For brevity, the rest of the file is omitted as it is unchanged.
// ... The full code is available in the previous version if needed.

// =================================================================
// 5. 启动服务器 (Start Server)
// =================================================================
app.listen(PORT, () => {
  console.log(`🚀 小鹅评语机后端服务已启动，监听端口: ${PORT}`);
});

// The rest of the functions (callAI, getBasePrompt, findArrayInJson, etc.) are unchanged.
// They are omitted here for clarity.

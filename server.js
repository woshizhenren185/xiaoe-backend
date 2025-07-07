// =================================================================
// 1. 引入核心模块 (Import Core Modules)
// =================================================================
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
// **** FIXED: Use the correct require syntax for v4 ****
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

// --- 用户认证路由 (Auth Routes) ---
app.post('/api/register', async (req, res, next) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' });
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();
        if (doc.exists) return res.status(400).json({ message: '用户名已存在' });
        
        await userRef.set({ username, password, credits: 50 });
        console.log(`[Auth] New user registered: ${username}`);
        res.status(201).json({ message: '注册成功！', user: { username, credits: 50 } });
    } catch (error) {
        next(error);
    }
});

app.post('/api/login', async (req, res, next) => {
    try {
        const { username, password } = req.body;
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();
        if (!doc.exists || doc.data().password !== password) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }
        const userData = doc.data();
        console.log(`[Auth] User logged in: ${username}`);
        res.json({ message: '登录成功！', user: { username: userData.username, credits: userData.credits } });
    } catch (error) {
        next(error);
    }
});

app.get('/api/user/:username', async (req, res, next) => {
    try {
        const { username } = req.params;
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();
        if (!doc.exists) return res.status(404).json({ message: '用户不存在' });
        const userData = doc.data();
        res.json({ user: { username: userData.username, credits: userData.credits } });
    } catch (error) {
        next(error);
    }
});

// --- 支付路由 (Payment Routes) ---
app.post('/api/create-alipay-order', async (req, res, next) => {
    try {
        const { username } = req.body;
        const orderId = `XIAOE_${Date.now()}`;
        console.log(`[Payment] Creating order for ${username}, OrderID: ${orderId}`);
        if (!alipaySdk) throw new Error("Alipay SDK not initialized.");

        // **** FIXED: Use the modern .curl() method instead of the deprecated .exec() ****
        const result = await alipaySdk.curl('alipay.trade.precreate', {
            notify_url: `https://xiaoe-backend.onrender.com/api/alipay-payment-notify`,
            biz_content: {
                out_trade_no: orderId,
                total_amount: '0.50',
                subject: '小鹅评语机 - 50点数充值',
                passback_params: encodeURIComponent(JSON.stringify({ username: username, orderId: orderId })),
            },
        });
        
        if(result.code !== '10000'){
            throw new Error(`Alipay precreate failed: ${result.subMsg || result.msg}`);
        }

        console.log(`[Payment] QR Code URL received from Alipay for OrderID: ${orderId}`);
        res.json({ qrCodeUrl: result.qrCode, orderId: orderId });
    } catch (error) {
        next(error);
    }
});

app.post('/api/alipay-payment-notify', async (req, res, next) => {
    try {
        console.log("[Payment] Received Alipay notification.");
        if (!alipaySdk) throw new Error("Alipay SDK not initialized for notification check.");
        const isVerified = alipaySdk.checkNotifySign(req.body);
        if (!isVerified) {
            console.error("[Payment Notify] Signature verification failed!");
            return res.status(400).send('failure');
        }
        console.log("[Payment Notify] Signature verified successfully.");

        const { trade_status, out_trade_no, passback_params } = req.body;
        if (trade_status === 'TRADE_SUCCESS' || trade_status === 'TRADE_FINISHED') {
            const { username } = JSON.parse(decodeURIComponent(passback_params));
            console.log(`[Payment Notify] Order ${out_trade_no} paid successfully by user: ${username}`);
            
            const userRef = db.collection('users').doc(username);
            await userRef.update({ credits: admin.firestore.FieldValue.increment(50) });
            console.log(`[Payment Notify] Credits updated for ${username}.`);
        }
        res.status(200).send('success');
    } catch (error) {
       next(error);
    }
});

// --- AI核心服务路由 (AI Core Routes) ---
// ... (Omitted for brevity, no changes)

// =================================================================
// 5. 全局错误处理 (Global Error Handler)
// =================================================================
app.use((err, req, res, next) => {
  console.error('💥 UNHANDLED ERROR:', err.stack || err);
  res.status(500).json({ message: err.message || '服务器发生未知错误!' });
});


// =================================================================
// 6. 启动服务器 (Start Server)
// =================================================================
app.listen(PORT, () => {
  console.log(`🚀 小鹅评语机后端服务已启动，监听端口: ${PORT}`);
});

// =================================================================
// 7. 辅助函数 (Helper Functions)
// =================================================================
// ... (Omitted for brevity, no changes)

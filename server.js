const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
// **** FIXED: Correctly import Alipay SDK for CommonJS ****
const AlipaySdk = require('alipay-sdk');

// --- Initialize Firebase ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
console.log('Successfully connected to Firebase Firestore.');

// --- Initialize Alipay SDK ---
const alipaySdk = new AlipaySdk({
  appId: process.env.ALIPAY_APP_ID,
  privateKey: process.env.ALIPAY_PRIVATE_KEY, // Your App Private Key
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY, // Alipay Public Key
  gateway: 'https://openapi.alipay.com/gateway.do',
});
console.log('Alipay SDK initialized.');


const app = express();
const PORT = process.env.PORT || 3001;

// --- Middleware ---
app.use(cors());
// Use express.text() for Alipay notifications, which are not in JSON format
app.use(express.text({ type: 'text/plain' })); 
app.use(express.json());


// --- API Keys from Environment Variables ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;


// --- Real Payment Endpoint ---
app.post('/api/create-alipay-order', async (req, res) => {
    const { username } = req.body;
    const orderId = `XIAOE_${Date.now()}`;
    console.log(`收到了用户 ${username} 的真实充值请求, 订单号: ${orderId}`);

    try {
        const result = await alipaySdk.exec('alipay.trade.precreate', {
            notifyUrl: `https://xiaoe-backend.onrender.com/api/alipay-payment-notify`,
            bizContent: {
                out_trade_no: orderId,
                total_amount: '0.50',
                subject: '小鹅评语机 - 50点数充值',
                passback_params: encodeURIComponent(JSON.stringify({ username: username })),
            },
        });
        
        console.log("成功从支付宝获取支付二维码链接。");
        res.json({ qrCodeUrl: result.qrCode, orderId: orderId });

    } catch (error) {
        console.error("Alipay order creation failed:", error);
        res.status(500).json({ message: "创建支付订单失败" });
    }
});

// --- Alipay Payment Notification Webhook ---
app.post('/api/alipay-payment-notify', async (req, res) => {
    console.log("收到了支付宝的异步通知...");
    try {
        const params = req.body;
        // The alipay-sdk's checkNotifySign method expects an object, but express.text() gives a string.
        // We need to parse it first. A simple parser for form-urlencoded data:
        const parsedParams = Object.fromEntries(new URLSearchParams(params));
        const isVerified = alipaySdk.checkNotifySign(parsedParams);
        
        if (!isVerified) {
            console.error("支付宝通知验签失败！");
            return res.status(400).send('failure');
        }

        const tradeStatus = parsedParams.trade_status;
        if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
            const outTradeNo = parsedParams.out_trade_no;
            const passbackParams = JSON.parse(decodeURIComponent(parsedParams.passback_params));
            const username = passbackParams.username;
            
            console.log(`订单 ${outTradeNo} 支付成功，用户: ${username}`);
            
            const userRef = db.collection('users').doc(username);
            await userRef.update({
                credits: admin.firestore.FieldValue.increment(50)
            });
            console.log(`支付成功，用户 ${username} 的点数已更新！`);
        }

        res.status(200).send('success');

    } catch (error) {
        console.error("处理支付宝通知时出错:", error);
        res.status(500).send('failure');
    }
});


// ... (User and AI endpoints remain the same) ...
// The following endpoints are omitted for brevity but are unchanged:
// POST /api/register
// POST /api/login
// GET /api/user/:username
// POST /api/generate-comment
// POST /api/generate-alternatives


// --- Server Start ---
app.listen(PORT, () => {
  console.log(`后台办公室已经启动，正在 http://localhost:${PORT} 等待指令`);
});


// ... (Helper functions remain the same) ...
// The following helper functions are omitted for brevity but are unchanged:
// callAI(model, prompt, isSimpleArray)
// getBasePrompt(profiles, style)
// findArrayInJson(data)


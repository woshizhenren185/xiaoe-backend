const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const admin = require('firebase-admin');
// **** NEW: Import Alipay SDK ****
const AlipaySdk = require('alipay-sdk').default;

// --- Initialize Firebase ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_JSON);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
console.log('Successfully connected to Firebase Firestore.');

// --- **** NEW: Initialize Alipay SDK **** ---
// Read your Alipay credentials securely from environment variables
const alipaySdk = new AlipaySdk({
  appId: process.env.ALIPAY_APP_ID,
  privateKey: process.env.ALIPAY_PRIVATE_KEY, // Your App Private Key
  alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY, // Alipay Public Key
  gateway: 'https://openapi.alipay.com/gateway.do', // Use sandbox for testing: 'https://openapi-sandbox.alipay.com/gateway.do'
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


// --- **** NEW: Real Payment Endpoint **** ---
app.post('/api/create-alipay-order', async (req, res) => {
    const { username } = req.body;
    const orderId = `XIAOE_${Date.now()}`; // Create a unique order ID
    console.log(`收到了用户 ${username} 的真实充值请求, 订单号: ${orderId}`);

    try {
        // Use Alipay's "当面付-扫码支付" (Pre-create) API
        const result = await alipaySdk.exec('alipay.trade.precreate', {
            notifyUrl: `https://xiaoe-backend.onrender.com/api/alipay-payment-notify`, // Your public notification URL
            bizContent: {
                out_trade_no: orderId,
                total_amount: '0.50', // Price in RMB
                subject: '小鹅评语机 - 50点数充值',
                // Store the username in a field that gets returned in the notification
                passback_params: encodeURIComponent(JSON.stringify({ username: username })),
            },
        });
        
        console.log("成功从支付宝获取支付二维码链接。");
        // Return the QR code URL to the frontend
        res.json({ qrCodeUrl: result.qrCode, orderId: orderId });

    } catch (error) {
        console.error("Alipay order creation failed:", error);
        res.status(500).json({ message: "创建支付订单失败" });
    }
});

// --- **** NEW: Alipay Payment Notification Webhook **** ---
app.post('/api/alipay-payment-notify', async (req, res) => {
    console.log("收到了支付宝的异步通知...");
    try {
        // 1. Verify the signature to ensure it's from Alipay
        const params = req.body; // Alipay sends data as form-urlencoded string
        const isVerified = alipaySdk.checkNotifySign(params);
        
        if (!isVerified) {
            console.error("支付宝通知验签失败！");
            return res.status(400).send('failure');
        }

        // 2. Check if the transaction was successful
        const tradeStatus = params.trade_status;
        if (tradeStatus === 'TRADE_SUCCESS' || tradeStatus === 'TRADE_FINISHED') {
            const outTradeNo = params.out_trade_no;
            const passbackParams = JSON.parse(decodeURIComponent(params.passback_params));
            const username = passbackParams.username;
            
            console.log(`订单 ${outTradeNo} 支付成功，用户: ${username}`);
            
            // 3. Update user credits in Firestore
            const userRef = db.collection('users').doc(username);
            await userRef.update({
                credits: admin.firestore.FieldValue.increment(50)
            });
            console.log(`支付成功，用户 ${username} 的点数已更新！`);
        }

        // 4. Respond to Alipay's server
        res.status(200).send('success');

    } catch (error) {
        console.error("处理支付宝通知时出错:", error);
        res.status(500).send('failure');
    }
});


// ... (User and AI endpoints remain the same) ...


// --- Server Start ---
app.listen(PORT, () => {
  console.log(`后台办公室已经启动，正在 http://localhost:${PORT} 等待指令`);
});


// ... (Helper functions remain the same) ...


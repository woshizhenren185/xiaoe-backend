// =================================================================
// 1. 引入核心模块 (Import Core Modules)
// =================================================================
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
// **** FIXED: Changed how AlipaySdk is imported to match its module structure ****
const AlipaySdk = require('alipay-sdk');
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
    process.exit(1); // Exit if Firebase cannot be initialized
}
const db = admin.firestore();

// **** FIXED: Changed how AlipaySdk is instantiated ****
// The constructor is available on the .default property when using require
const alipaySdk = new AlipaySdk.default({
    appId: process.env.ALIPAY_APP_ID,
    privateKey: process.env.ALIPAY_PRIVATE_KEY,
    alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
    gateway: 'https://openapi.alipay.com/gateway.do',
});
console.log('✅ Alipay SDK initialized.');

// 初始化 Express 应用
const app = express();
const PORT = process.env.PORT || 3001;

// =================================================================
// 3. 中间件设置 (Middleware Setup)
// =================================================================
app.use(cors()); // 允许跨域请求
app.use(express.json()); // 解析JSON请求体
app.use(express.urlencoded({ extended: true })); // 解析支付宝回调的表单数据

// =================================================================
// 4. API 路由定义 (API Routes)
// =================================================================

// --- 用户认证路由 (Auth Routes) ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: '用户名和密码不能为空' });
    try {
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();
        if (doc.exists) return res.status(400).json({ message: '用户名已存在' });
        
        await userRef.set({ username, password, credits: 50 });
        console.log(`[Auth] New user registered: ${username}`);
        res.status(201).json({ message: '注册成功！', user: { username, credits: 50 } });
    } catch (error) {
        console.error("[Register Error]", error);
        res.status(500).json({ message: "注册失败，服务器内部错误" });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();
        if (!doc.exists || doc.data().password !== password) {
            return res.status(401).json({ message: '用户名或密码错误' });
        }
        const userData = doc.data();
        console.log(`[Auth] User logged in: ${username}`);
        res.json({ message: '登录成功！', user: { username: userData.username, credits: userData.credits } });
    } catch (error) {
        console.error("[Login Error]", error);
        res.status(500).json({ message: "登录失败，服务器内部错误" });
    }
});

app.get('/api/user/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();
        if (!doc.exists) return res.status(404).json({ message: '用户不存在' });
        const userData = doc.data();
        res.json({ user: { username: userData.username, credits: userData.credits } });
    } catch (error) {
        console.error("[Get User Error]", error);
        res.status(500).json({ message: "获取用户信息失败" });
    }
});

// --- 支付路由 (Payment Routes) ---
app.post('/api/create-alipay-order', async (req, res) => {
    const { username } = req.body;
    const orderId = `XIAOE_${Date.now()}`;
    console.log(`[Payment] Creating order for ${username}, OrderID: ${orderId}`);
    try {
        const result = await alipaySdk.exec('alipay.trade.precreate', {
            notifyUrl: `https://xiaoe-backend.onrender.com/api/alipay-payment-notify`,
            bizContent: {
                out_trade_no: orderId,
                total_amount: '0.50',
                subject: '小鹅评语机 - 50点数充值',
                passback_params: encodeURIComponent(JSON.stringify({ username: username, orderId: orderId })),
            },
        });
        console.log(`[Payment] QR Code URL received from Alipay for OrderID: ${orderId}`);
        res.json({ qrCodeUrl: result.qrCode, orderId: orderId });
    } catch (error) {
        console.error("[Alipay Order Error]", error);
        res.status(500).json({ message: "创建支付订单失败" });
    }
});

app.post('/api/alipay-payment-notify', async (req, res) => {
    console.log("[Payment] Received Alipay notification.");
    try {
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
        console.error("[Payment Notify Error]", error);
        res.status(500).send('failure');
    }
});

// --- AI核心服务路由 (AI Core Routes) ---
app.post('/api/generate-comment', async (req, res) => {
    try {
        const { studentProfiles, commentStyle, model, username } = req.body;
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();
        if (!doc.exists) return res.status(401).json({ message: '用户未登录' });

        const user = doc.data();
        const requiredCredits = studentProfiles.length;
        if (user.credits < requiredCredits) {
            return res.status(403).json({ message: `点数不足！需要 ${requiredCredits} 点，剩余 ${user.credits} 点。` });
        }

        const prompt = getBasePrompt(studentProfiles, commentStyle);
        const aiResponse = await callAI(model, prompt, false);
        
        await userRef.update({ credits: admin.firestore.FieldValue.increment(-requiredCredits) });
        console.log(`[AI Service] User ${username} used ${requiredCredits} credits, ${user.credits - requiredCredits} remaining.`);
        res.json(aiResponse);
    } catch (error) {
        console.error('[Generate Comment Error]', error);
        res.status(500).json({ message: '服务器处理评语生成请求失败', error: error.message });
    }
});

app.post('/api/generate-alternatives', async (req, res) => {
    try {
        const { originalText, sourceTag, commentStyle, model, username } = req.body;
        const userRef = db.collection('users').doc(username);
        const doc = await userRef.get();
        if (!doc.exists) return res.status(401).json({ message: '用户未登录' });
        
        const prompt = `你是一个语言表达大师。请将下面的句子，用5种不同的、高质量的方式重新表达，同时保持核心意思和“${commentStyle}”的风格。句子：“${originalText}”。它描述的概念是“${sourceTag}”。请以JSON数组的格式返回5个字符串。`;
        const aiResponse = await callAI(model, prompt, true);
        res.json(aiResponse);
    } catch (error) {
        console.error('[Generate Alternatives Error]', error);
        res.status(500).json({ message: '服务器处理同义句请求失败', error: error.message });
    }
});

// =================================================================
// 5. 启动服务器 (Start Server)
// =================================================================
app.listen(PORT, () => {
  console.log(`🚀 小鹅评语机后端服务已启动，监听端口: ${PORT}`);
});

// =================================================================
// 6. 辅助函数 (Helper Functions)
// =================================================================
async function callAI(model, prompt, isSimpleArray) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    let apiKey, url, payload, headers;

    if (model === 'gemini') {
        apiKey = GEMINI_API_KEY;
        url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;
        const schema = isSimpleArray 
            ? { type: 'ARRAY', items: { type: 'STRING' } } 
            : { type: 'ARRAY', items: { type: 'OBJECT', properties: { studentName: { type: 'STRING' }, intro: { type: 'STRING' }, body: { type: 'ARRAY', items: { type: 'OBJECT', properties: { source: { type: 'STRING' }, text: { type: 'STRING' } } } }, conclusion: { type: 'STRING' } }, required: ['studentName', 'intro', 'body', 'conclusion'] } };
        payload = { 
            contents: [{ role: "user", parts: [{ text: prompt }] }], 
            generationConfig: { responseMimeType: "application/json", responseSchema: schema, temperature: 0.8 } 
        };
        headers = { 'Content-Type': 'application/json' };
    } else { // DeepSeek or OpenAI
        const baseHost = model === 'openai' ? 'https://api.openai.com' : 'https://api.deepseek.com';
        apiKey = model === 'openai' ? 'OPENAI_API_KEY_PLACEHOLDER' : DEEPSEEK_API_KEY;
        const modelName = model === 'openai' ? 'gpt-4o-mini' : 'deepseek-chat';
        url = `${baseHost}/chat/completions`;
        payload = {
            model: modelName,
            messages: [{ role: 'system', content: "You are a helpful assistant designed to output JSON." }, { role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.8,
            max_tokens: 8192, 
        };
        headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    }

    try {
        const response = await axios.post(url, payload, { headers });
        const data = response.data;
        let rawText = model === 'gemini' ? data.candidates[0].content.parts[0].text : data.choices[0].message.content;
        let jsonString = rawText;
        const match = rawText.match(/```json\s*([\s\S]*?)\s*```|(\[.*\]|\{.*\})/s);
        if (match) jsonString = match[1] || match[2];
        return findArrayInJson(JSON.parse(jsonString));
    } catch (error) {
        console.error(`[AI Call Error - ${model}]`, error.response ? error.response.data : error.message);
        throw new Error(`${model} API call failed`);
    }
}

function getBasePrompt(profiles, style) {
    const studentProfilesChunk = profiles.map(p => ` - 姓名: ${p.name}, 职务: ${p.role}, 具体事例: ${p.incidents}, 标签: ${p.tags}`).join('\n');
    const formatInstruction = `**输出格式**: 你的整个输出必须是一个JSON数组 [...]，数组中的每个对象都对应一个学生。不要在JSON数组前后添加任何说明性文字。`;
    return `你是一位顶级的中文教师和语言大师，现在需要为学生生成评语“蓝图”。
    **评语风格**: ${style}
    ---
    **核心指令 (必须严格遵守)**
    1. **结构化输出**: 对每个学生，都返回一个包含 'studentName', 'intro', 'body', 'conclusion' 四个键的JSON对象。'studentName' 必须是学生的姓名字符串。
    2. **姓名与代词规则 (绝对禁止违反)**: 在整个评语中，学生的全名只允许在 intro 部分出现一次。在 body 和 conclusion 部分，必须使用第二人称代词“你”。
    3. **内容融合规则 (高优先级)**: 如果学生档案的“职务”或“具体事例”字段不为'无'，你必须将这些信息作为评语的核心素材。
    ---
    **学生档案**:
    ${studentProfilesChunk}
    ---
    ${formatInstruction}`;
}

function findArrayInJson(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        for (const key in data) {
            const result = findArrayInJson(data[key]);
            if (result) return result;
        }
    }
    return null;
}
